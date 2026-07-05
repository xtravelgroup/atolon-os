// Reclutamiento.jsx — Gestión de vacantes y postulaciones (RRHH)
// El portal público vive en /carreras (ReclutamientoPortal.jsx).
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";

const fmtFecha = (d) => d ? new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const slugify = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const uid8 = () => Math.random().toString(36).slice(2, 10).toUpperCase();

const ESTADOS = [
  { k: "recibida",     l: "Recibida",     c: "rgba(255,255,255,0.5)" },
  { k: "revision",     l: "En revisión",  c: "#38bdf8" },
  { k: "entrevista_1", l: "Entrevista 1", c: "#a78bfa" },
  { k: "entrevista_2", l: "Entrevista 2", c: "#c084fc" },
  { k: "oferta",       l: "Oferta",       c: "#f59e0b" },
  { k: "contratado",   l: "Contratado",   c: "#22c55e" },
  { k: "descartado",   l: "Descartado",   c: "#ef4444" },
];
const TIPOS_CONTRATO = [
  { k: "indefinido", l: "Indefinido" },
  { k: "temporal",   l: "Temporal" },
  { k: "obra_labor", l: "Obra/labor" },
  { k: "practicas",  l: "Prácticas" },
];
const MODALIDADES = [
  { k: "presencial", l: "Presencial" },
  { k: "hibrido",    l: "Híbrido" },
  { k: "remoto",     l: "Remoto" },
];

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS  = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS  = { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

export default function Reclutamiento() {
  const { isMobile } = useMobile();
  const [tab, setTab] = useState("vacantes");
  const [vacantes, setVacantes] = useState([]);
  const [postulaciones, setPostulaciones] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [posiciones, setPosiciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editVacante, setEditVacante] = useState(null);    // null | "new" | vacante row
  const [verVacanteId, setVerVacanteId] = useState(null);  // vista pipeline de una vacante
  const [verPostulacion, setVerPostulacion] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [vR, pR, dR, posR] = await Promise.all([
      supabase.from("rh_vacantes").select("*").order("created_at", { ascending: false }),
      supabase.from("rh_postulaciones").select("*").order("created_at", { ascending: false }),
      supabase.from("rh_departamentos").select("id,nombre").then(r => r).catch(() => ({ data: [] })),
      supabase.from("rh_posiciones").select("id, nombre, departamento_id, cupos").eq("activo", true).order("nombre").then(r => r).catch(() => ({ data: [] })),
    ]);
    setVacantes(vR.data || []);
    setPostulaciones(pR.data || []);
    setDepartamentos(dR.data || []);
    setPosiciones(posR.data || []);
    if (!silent) setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const reload = () => load(true);

  // ── Stats por vacante (cuántas postulaciones por estado) ────────────
  const statsPorVacante = useMemo(() => {
    const map = {};
    postulaciones.forEach(p => {
      if (!map[p.vacante_id]) map[p.vacante_id] = { total: 0 };
      map[p.vacante_id].total++;
      map[p.vacante_id][p.estado] = (map[p.vacante_id][p.estado] || 0) + 1;
    });
    return map;
  }, [postulaciones]);

  // ── Filtrado ────────────────────────────────────────────────────────
  const vacantesFiltradas = useMemo(() => {
    const q = search.toLowerCase().trim();
    return vacantes.filter(v => {
      if (!q) return true;
      return `${v.titulo || ""} ${v.codigo || ""} ${v.ubicacion || ""}`.toLowerCase().includes(q);
    });
  }, [vacantes, search]);

  const totalAbiertas = vacantes.filter(v => v.estado === "abierta").length;
  const totalPublicadas = vacantes.filter(v => v.publicada && v.estado === "abierta").length;
  const totalPostulaciones = postulaciones.length;
  const sinRevisar = postulaciones.filter(p => p.estado === "recibida").length;

  // Si está viendo una vacante específica → modo pipeline
  if (verVacanteId) {
    const vacante = vacantes.find(v => v.id === verVacanteId);
    if (!vacante) { setVerVacanteId(null); return null; }
    return <PipelineVacante
      vacante={vacante}
      postulaciones={postulaciones.filter(p => p.vacante_id === verVacanteId)}
      onBack={() => setVerVacanteId(null)}
      onOpenPost={setVerPostulacion}
      onReload={reload}
    />;
  }

  if (verPostulacion) {
    return <PostulacionDetalle
      postulacion={verPostulacion}
      vacante={vacantes.find(v => v.id === verPostulacion.vacante_id)}
      onBack={() => setVerPostulacion(null)}
      onReload={reload}
    />;
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;

  return (
    <div style={{ padding: isMobile ? 14 : 24, maxWidth: 1300, margin: "0 auto", color: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800 }}>👔 Reclutamiento</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            Vacantes y candidatos · Portal público:{" "}
            <a href="/carreras" target="_blank" rel="noreferrer" style={{ color: B.sky, textDecoration: "underline" }}>www.atolon.co/carreras</a>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setEditVacante("new")} style={BTN(B.success)}>+ Nueva vacante</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: 12, marginBottom: 18 }}>
        {[
          { l: "Vacantes abiertas", v: totalAbiertas, c: B.sky, sub: `${totalPublicadas} publicadas` },
          { l: "Postulaciones",     v: totalPostulaciones, c: "#a78bfa" },
          { l: "Sin revisar",       v: sinRevisar, c: sinRevisar > 0 ? "#f59e0b" : "rgba(255,255,255,0.4)" },
          { l: "Contratados",       v: postulaciones.filter(p => p.estado === "contratado").length, c: "#22c55e" },
        ].map(k => (
          <div key={k.l} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", borderLeft: `4px solid ${k.c}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.c, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1, marginTop: 4 }}>{k.v}</div>
            {k.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${B.navyLight}`, flexWrap: "wrap" }}>
        {(() => {
          const inbox = postulaciones.filter(p => !p.vacante_id).length;
          return [
            ["vacantes",      `📋 Vacantes (${vacantes.length})`],
            ["inbox",         `📥 Inbox${inbox > 0 ? ` (${inbox})` : ""}`],
            ["postulaciones", `📨 Postulaciones (${totalPostulaciones})`],
          ];
        })().map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              background: "none", color: tab === k ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: tab === k ? `2px solid ${B.sky}` : "2px solid transparent" }}>{l}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === "vacantes" ? "🔍 Buscar vacante…" : "🔍 Buscar candidato…"}
          style={{ ...IS, maxWidth: 360 }} />
      </div>

      {tab === "vacantes" && (
        <ListaVacantes items={vacantesFiltradas} stats={statsPorVacante} departamentos={departamentos}
          onEdit={setEditVacante} onVer={(v) => setVerVacanteId(v.id)} onReload={reload} />
      )}
      {tab === "inbox" && (
        <Inbox items={postulaciones.filter(p => !p.vacante_id)} vacantes={vacantes} onOpen={setVerPostulacion} onReload={reload} search={search} />
      )}
      {tab === "postulaciones" && (
        <ListaPostulaciones items={postulaciones.filter(p => p.vacante_id)} vacantes={vacantes} onOpen={setVerPostulacion} search={search} />
      )}

      {editVacante && (
        <VacanteModal vacante={editVacante === "new" ? null : editVacante} departamentos={departamentos} posiciones={posiciones}
          onClose={() => setEditVacante(null)} onSaved={reload} />
      )}
    </div>
  );
}

// ─── INBOX (CVs sin vacante asignada) ────────────────────────────────
// Recibe CVs por email a oportunidades@atolon.co (vía webhook
// oportunidades-inbox) o desde un form genérico. Aquí se asignan a una
// vacante específica o se descartan.
function Inbox({ items, vacantes, onOpen, onReload, search }) {
  const q = (search || "").toLowerCase().trim();
  const filtered = items.filter(p => !q || `${p.nombre || ""} ${p.email || ""} ${p.email_subject || ""}`.toLowerCase().includes(q));

  const asignar = async (p, vacanteId) => {
    if (!vacanteId) return;
    await supabase.from("rh_postulaciones").update({ vacante_id: vacanteId, updated_at: new Date().toISOString() }).eq("id", p.id);
    await supabase.from("rh_postulaciones_eventos").insert({
      postulacion_id: p.id, tipo: "asignada_vacante",
      descripcion: `Asignada desde inbox a vacante`, metadata: { vacante_id: vacanteId },
    });
    onReload();
  };

  return (
    <>
      <div style={{ background: "rgba(34,197,94,0.06)", border: `1px solid #22c55e44`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>📥 Inbox de oportunidades</div>
        <div style={{ color: "rgba(255,255,255,0.6)" }}>
          CVs que llegan a <code style={{ color: B.sky }}>oportunidades@atolon.co</code> aparecen aquí. Asignalos a una vacante o descartá los que no aplican.
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navyMid, borderRadius: 12 }}>
          📭 Sin CVs en el inbox{q ? " para esa búsqueda" : ""}.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {filtered.map((p, i) => (
            <div key={p.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${B.navyLight}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: B.sky + "22", color: B.sky, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {(p.nombre || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    {p.email}
                    {p.fuente === "email" && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 6, background: "#a78bfa22", color: "#a78bfa" }}>📧 Email</span>}
                    {p.fuente === "inbox_general" && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 6, background: "#22c55e22", color: "#22c55e" }}>🌐 Form</span>}
                  </div>
                  {p.email_subject && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4, fontStyle: "italic" }}>
                      Asunto: "{p.email_subject}"
                    </div>
                  )}
                  {p.cv_nombre && (
                    <div style={{ fontSize: 10, color: B.sky, marginTop: 3 }}>📎 {p.cv_nombre}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{fmtFecha(p.created_at)}</span>
                  <select onChange={e => { if (e.target.value) asignar(p, e.target.value); }} defaultValue=""
                    style={{ padding: "6px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 11, cursor: "pointer" }}>
                    <option value="">Asignar a vacante…</option>
                    {vacantes.filter(v => v.estado === "abierta").map(v => (
                      <option key={v.id} value={v.id}>{v.titulo}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => onOpen(p)}
                      style={{ ...BTN(B.navyLight), fontSize: 10, padding: "4px 10px" }}>Ver</button>
                    <button type="button" onClick={async () => {
                      if (!confirm("¿Descartar este CV?")) return;
                      await supabase.from("rh_postulaciones").update({ estado: "descartado" }).eq("id", p.id);
                      onReload();
                    }} style={{ ...BTN("transparent", "#ef4444"), border: `1px solid #ef444455`, fontSize: 10, padding: "4px 10px" }}>Descartar</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── LISTA DE VACANTES ───────────────────────────────────────────────
function ListaVacantes({ items, stats, departamentos, onEdit, onVer, onReload }) {
  if (items.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navyMid, borderRadius: 12 }}>
      No hay vacantes. Creá la primera ↑
    </div>;
  }
  const togglePublicada = async (v) => {
    await supabase.from("rh_vacantes").update({ publicada: !v.publicada, updated_at: new Date().toISOString() }).eq("id", v.id);
    onReload();
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
      {items.map(v => {
        const s = stats[v.id] || {};
        const dept = departamentos.find(d => d.id === v.departamento_id);
        const tipo = TIPOS_CONTRATO.find(t => t.k === v.tipo_contrato);
        const mod  = MODALIDADES.find(m => m.k === v.modalidad);
        const colorEstado = v.estado === "abierta" ? "#22c55e" : v.estado === "pausada" ? "#f59e0b" : "rgba(255,255,255,0.3)";
        return (
          <div key={v.id} style={{ background: B.navyMid, borderRadius: 12, padding: 14, borderLeft: `4px solid ${colorEstado}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{v.titulo}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {v.codigo || "—"} · {dept?.nombre || "Sin depto"}
                </div>
              </div>
              <span title={v.publicada ? "Visible en /carreras" : "No publicada"}
                onClick={() => togglePublicada(v)}
                style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer",
                  background: v.publicada ? "#22c55e22" : "rgba(255,255,255,0.05)",
                  color: v.publicada ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                {v.publicada ? "🌐 Publicada" : "Borrador"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
              {tipo && <span>📝 {tipo.l}</span>}
              {mod && <span>📍 {mod.l}</span>}
              {v.ubicacion && <span>· {v.ubicacion}</span>}
              {v.vacantes_qty > 1 && <span>· {v.vacantes_qty} cupos</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10, fontSize: 10, textAlign: "center" }}>
              <div style={{ padding: "4px 0", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: B.sky }}>{s.total || 0}</div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>Total</div>
              </div>
              <div style={{ padding: "4px 0", background: "rgba(245,158,11,0.08)", borderRadius: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>{s.recibida || 0}</div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>Nueva</div>
              </div>
              <div style={{ padding: "4px 0", background: "rgba(167,139,250,0.08)", borderRadius: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa" }}>{(s.entrevista_1 || 0) + (s.entrevista_2 || 0)}</div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>Entrev.</div>
              </div>
              <div style={{ padding: "4px 0", background: "rgba(34,197,94,0.08)", borderRadius: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{s.contratado || 0}</div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>Hired</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => onVer(v)} style={{ ...BTN(B.sky, B.navy), flex: 1, fontSize: 11 }}>👥 Ver candidatos</button>
              <button type="button" onClick={() => onEdit(v)} style={{ ...BTN(B.navyLight), fontSize: 11 }}>✏️</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── LISTA DE POSTULACIONES (todas) ──────────────────────────────────
function ListaPostulaciones({ items, vacantes, onOpen, search }) {
  const q = (search || "").toLowerCase().trim();
  const filtered = items.filter(p => !q || `${p.nombre || ""} ${p.email || ""} ${p.cedula || ""}`.toLowerCase().includes(q));
  if (filtered.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navyMid, borderRadius: 12 }}>
      Sin postulaciones {q ? "para esa búsqueda" : "todavía"}.
    </div>;
  }
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
      {filtered.map((p, i) => {
        const v = vacantes.find(x => x.id === p.vacante_id);
        const e = ESTADOS.find(x => x.k === p.estado) || ESTADOS[0];
        return (
          <button key={p.id} type="button" onClick={() => onOpen(p)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 16px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)", border: "none", borderBottom: `1px solid ${B.navyLight}`, color: "#fff", cursor: "pointer", textAlign: "left" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: e.c + "22", color: e.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
              {(p.nombre || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                {v?.titulo || "—"} · {p.email}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: e.c + "22", color: e.c, fontWeight: 700, textTransform: "uppercase" }}>{e.l}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{fmtFecha(p.created_at)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── PIPELINE DE UNA VACANTE ─────────────────────────────────────────
function PipelineVacante({ vacante, postulaciones, onBack, onOpenPost, onReload }) {
  const { isMobile } = useMobile();
  return (
    <div style={{ padding: isMobile ? 14 : 24, maxWidth: 1500, margin: "0 auto", color: "#fff" }}>
      <button type="button" onClick={onBack} style={{ ...BTN(B.navyLight), marginBottom: 14 }}>← Volver a vacantes</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800 }}>{vacante.titulo}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            {vacante.codigo || "—"} · {postulaciones.length} postulaciones
            {vacante.publicada && <> · <a href={`/carreras/${vacante.slug || vacante.id}`} target="_blank" rel="noreferrer" style={{ color: B.sky }}>Ver en portal ↗</a></>}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 1 : 4}, minmax(220px, 1fr))`, gap: 10, overflowX: isMobile ? "visible" : "auto" }}>
        {ESTADOS.map(e => {
          const items = postulaciones.filter(p => p.estado === e.k);
          return (
            <div key={e.k} style={{ background: B.navyMid, borderRadius: 12, padding: 10, minWidth: 220 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${e.c}33` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: e.c, textTransform: "uppercase", letterSpacing: "0.05em" }}>{e.l}</span>
                <span style={{ fontSize: 11, color: e.c, fontWeight: 800 }}>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>Vacío</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map(p => (
                    <button key={p.id} type="button" onClick={() => onOpenPost(p)}
                      style={{ background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "#fff", textAlign: "left" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                        {fmtFecha(p.created_at)}{p.calificacion ? ` · ${"★".repeat(p.calificacion)}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DETALLE DE POSTULACIÓN ──────────────────────────────────────────
function PostulacionDetalle({ postulacion, vacante, onBack, onReload }) {
  const { isMobile } = useMobile();
  const [p, setP] = useState(postulacion);
  const [eventos, setEventos] = useState([]);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email || ""));
    supabase.from("rh_postulaciones_eventos").select("*").eq("postulacion_id", postulacion.id).order("created_at", { ascending: false })
      .then(({ data }) => setEventos(data || []));
  }, [postulacion.id]);

  const cambiarEstado = async (nuevoEstado) => {
    if (nuevoEstado === p.estado) return;
    setSaving(true);
    const update = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (nuevoEstado === "contratado") update.contratado_at = new Date().toISOString();
    await supabase.from("rh_postulaciones").update(update).eq("id", p.id);
    await supabase.from("rh_postulaciones_eventos").insert({
      postulacion_id: p.id, tipo: "estado_cambio",
      estado_anterior: p.estado, estado_nuevo: nuevoEstado,
      descripcion: `Estado: ${p.estado} → ${nuevoEstado}`,
      autor: userEmail,
    });
    setP({ ...p, ...update });
    setEventos(prev => [{ id: crypto.randomUUID(), tipo: "estado_cambio", estado_anterior: p.estado, estado_nuevo: nuevoEstado, descripcion: `Estado: ${p.estado} → ${nuevoEstado}`, autor: userEmail, created_at: new Date().toISOString() }, ...prev]);
    setSaving(false);
    onReload();
  };

  const agregarNota = async () => {
    if (!nota.trim()) return;
    setSaving(true);
    await supabase.from("rh_postulaciones_eventos").insert({
      postulacion_id: p.id, tipo: "nota", descripcion: nota.trim(), autor: userEmail,
    });
    setEventos(prev => [{ id: crypto.randomUUID(), tipo: "nota", descripcion: nota.trim(), autor: userEmail, created_at: new Date().toISOString() }, ...prev]);
    setNota("");
    setSaving(false);
  };

  const setCalificacion = async (cal) => {
    await supabase.from("rh_postulaciones").update({ calificacion: cal, updated_at: new Date().toISOString() }).eq("id", p.id);
    setP({ ...p, calificacion: cal });
    onReload();
  };

  const descargarCV = async () => {
    if (!p.cv_url) return alert("Sin CV adjunto");
    // signed URL del bucket privado
    const path = p.cv_url.replace(/^.*cv-postulaciones\//, "");
    const { data } = await supabase.storage.from("cv-postulaciones").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else alert("No se pudo generar el link de descarga");
  };

  const e = ESTADOS.find(x => x.k === p.estado) || ESTADOS[0];

  return (
    <div style={{ padding: isMobile ? 14 : 24, maxWidth: 1100, margin: "0 auto", color: "#fff" }}>
      <button type="button" onClick={onBack} style={{ ...BTN(B.navyLight), marginBottom: 14 }}>← Volver</button>
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800 }}>{p.nombre}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              {vacante?.titulo || "—"} · {fmtFecha(p.created_at)}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 8, fontSize: 16 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setCalificacion(n)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: n <= (p.calificacion || 0) ? "#f59e0b" : "rgba(255,255,255,0.2)", fontSize: 22 }}>★</button>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 11, padding: "6px 14px", borderRadius: 16, background: e.c + "22", color: e.c, fontWeight: 800, textTransform: "uppercase" }}>{e.l}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10, marginBottom: 14, fontSize: 12 }}>
          {[
            ["📧", p.email],
            ["📱", p.telefono || "—"],
            ["🪪", p.cedula || "—"],
            ["📍", `${p.ciudad || ""}${p.pais ? " · " + p.pais : ""}` || "—"],
            ["💼", p.experiencia_anos != null ? `${p.experiencia_anos} años exp.` : "—"],
            ["🎓", p.educacion || "—"],
          ].map(([icon, v], i) => (
            <div key={i} style={{ background: B.navy, padding: "8px 10px", borderRadius: 8 }}>
              <span style={{ marginRight: 6 }}>{icon}</span>{v}
            </div>
          ))}
        </div>

        {(p.cv_url || p.linkedin_url || p.portfolio_url) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {p.cv_url && <button type="button" onClick={descargarCV} style={BTN(B.sky, B.navy)}>📎 Descargar CV</button>}
            {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ ...BTN(B.navyLight), textDecoration: "none", display: "inline-block" }}>🔗 LinkedIn</a>}
            {p.portfolio_url && <a href={p.portfolio_url} target="_blank" rel="noreferrer" style={{ ...BTN(B.navyLight), textDecoration: "none", display: "inline-block" }}>🎨 Portfolio</a>}
          </div>
        )}

        {p.carta_motivacion && (
          <div style={{ background: B.navy, borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, fontStyle: "italic" }}>
            "{p.carta_motivacion}"
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 6 }}>Cambiar estado</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ESTADOS.map(es => (
              <button key={es.k} type="button" onClick={() => cambiarEstado(es.k)} disabled={saving || es.k === p.estado}
                style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${es.c}55`, fontSize: 11, fontWeight: 700, cursor: es.k === p.estado ? "default" : "pointer",
                  background: es.k === p.estado ? es.c + "33" : "transparent", color: es.c, opacity: saving && es.k !== p.estado ? 0.5 : 1 }}>
                {es.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notas / Bitácora */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📝 Notas y bitácora</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder="Agregar nota interna…" style={{ ...IS, flex: 1, resize: "vertical", fontFamily: "inherit" }} />
          <button type="button" onClick={agregarNota} disabled={saving || !nota.trim()} style={{ ...BTN(B.success), alignSelf: "flex-start" }}>+ Nota</button>
        </div>
        {eventos.length === 0 ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>Sin actividad</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {eventos.map(ev => (
              <div key={ev.id} style={{ background: B.navy, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  <span>{ev.tipo === "estado_cambio" ? "🔄" : ev.tipo === "nota" ? "📝" : ev.tipo === "entrevista_agendada" ? "📅" : "•"} {ev.autor}</span>
                  <span>{new Date(ev.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div style={{ color: "#fff" }}>{ev.descripcion}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MODAL CREAR/EDITAR VACANTE ──────────────────────────────────────
function VacanteModal({ vacante, departamentos, posiciones = [], onClose, onSaved }) {
  const isEdit = !!vacante;
  const [f, setF] = useState({
    titulo: vacante?.titulo || "",
    codigo: vacante?.codigo || "",
    slug: vacante?.slug || "",
    departamento_id: vacante?.departamento_id || "",
    posicion_id: vacante?.posicion_id || "",
    descripcion: vacante?.descripcion || "",
    responsabilidades: vacante?.responsabilidades || "",
    requisitos: vacante?.requisitos || "",
    beneficios: vacante?.beneficios || "",
    salario_min: vacante?.salario_min || "",
    salario_max: vacante?.salario_max || "",
    salario_visible: vacante?.salario_visible ?? false,
    tipo_contrato: vacante?.tipo_contrato || "indefinido",
    modalidad: vacante?.modalidad || "presencial",
    ubicacion: vacante?.ubicacion || "Cartagena",
    vacantes_qty: vacante?.vacantes_qty || 1,
    prioridad: vacante?.prioridad || "normal",
    estado: vacante?.estado || "abierta",
    publicada: vacante?.publicada ?? false,
    fecha_cierre: vacante?.fecha_cierre || "",
  });
  // Modo del selector: "organigrama" (posición existente) o "nueva" (título libre).
  const [modo, setModo] = useState(vacante?.posicion_id ? "organigrama" : (posiciones.length > 0 ? "organigrama" : "nueva"));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const pickPosicion = (posId) => {
    if (!posId) {
      setF(s => ({ ...s, posicion_id: "" }));
      return;
    }
    const p = posiciones.find(x => x.id === posId);
    if (!p) return;
    setF(s => ({
      ...s,
      posicion_id: posId,
      titulo: p.nombre,                       // el titulo se auto-carga del organigrama
      departamento_id: p.departamento_id || s.departamento_id || "",
    }));
  };

  const guardar = async () => {
    if (!f.titulo.trim()) return alert("El título es obligatorio.");
    setSaving(true);
    const slug = f.slug || slugify(f.titulo) + "-" + uid8().toLowerCase().slice(0, 4);
    const codigo = f.codigo || `VAC-${new Date().getFullYear()}-${uid8().slice(0, 4)}`;
    const posicionValida = f.posicion_id && posiciones.some(p => p.id === f.posicion_id);
    const payload = {
      ...f,
      slug, codigo,
      salario_min: Number(f.salario_min) || null,
      salario_max: Number(f.salario_max) || null,
      vacantes_qty: Number(f.vacantes_qty) || 1,
      fecha_cierre: f.fecha_cierre || null,
      departamento_id: f.departamento_id || null,
      posicion_id: modo === "organigrama" && posicionValida ? f.posicion_id : null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from("rh_vacantes").update(payload).eq("id", vacante.id));
    } else {
      ({ error } = await supabase.from("rh_vacantes").insert(payload));
    }
    setSaving(false);
    if (error) return alert("Error: " + error.message);
    onSaved();
    onClose();
  };

  const eliminar = async () => {
    if (!confirm("¿Eliminar esta vacante? Las postulaciones también se borrarán.")) return;
    setSaving(true);
    await supabase.from("rh_vacantes").delete().eq("id", vacante.id);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 16, padding: 24, maxWidth: 720, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{isEdit ? "Editar vacante" : "Nueva vacante"}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Selector: posicion existente en el organigrama vs nueva */}
          <div>
            <label style={LS}>Posición</label>
            <div style={{ display: "flex", background: B.navyMid, borderRadius: 8, padding: 3, gap: 2, marginTop: 4, marginBottom: 8 }}>
              <button type="button" onClick={() => setModo("organigrama")} disabled={posiciones.length === 0}
                style={{ flex: 1, padding: "6px 12px", borderRadius: 6, border: "none",
                  background: modo === "organigrama" ? B.sky : "transparent",
                  color: modo === "organigrama" ? B.navy : posiciones.length === 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)",
                  fontSize: 12, fontWeight: 700, cursor: posiciones.length === 0 ? "not-allowed" : "pointer" }}>
                🌳 De organigrama {posiciones.length > 0 && `(${posiciones.length})`}
              </button>
              <button type="button" onClick={() => { setModo("nueva"); set("posicion_id", ""); }}
                style={{ flex: 1, padding: "6px 12px", borderRadius: 6, border: "none",
                  background: modo === "nueva" ? B.sky : "transparent",
                  color: modo === "nueva" ? B.navy : "rgba(255,255,255,0.6)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ✨ Nueva posición
              </button>
            </div>
            {modo === "organigrama" ? (
              <select value={f.posicion_id} onChange={e => pickPosicion(e.target.value)} style={IS}>
                <option value="">— Selecciona una posición del organigrama —</option>
                {posiciones.map(p => {
                  const dept = departamentos.find(d => d.id === p.departamento_id);
                  return <option key={p.id} value={p.id}>{p.nombre}{dept ? ` — ${dept.nombre}` : ""}{p.cupos > 1 ? ` (${p.cupos} cupos)` : ""}</option>;
                })}
              </select>
            ) : (
              <input value={f.titulo} onChange={e => set("titulo", e.target.value)} style={IS}
                placeholder="Ej: Coordinador de Eventos" autoFocus />
            )}
            {modo === "organigrama" && f.posicion_id && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                Título auto-cargado: <b style={{ color: B.sand }}>{f.titulo}</b>
              </div>
            )}
          </div>

          <div>
            <label style={LS}>Título de la vacante *</label>
            <input value={f.titulo} onChange={e => set("titulo", e.target.value)} style={IS}
              placeholder="Ej: Coordinador de Eventos"
              disabled={modo === "organigrama" && !!f.posicion_id} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Departamento</label>
              <select value={f.departamento_id} onChange={e => set("departamento_id", e.target.value)} style={IS}>
                <option value="">— Sin asignar —</option>
                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Tipo de contrato</label>
              <select value={f.tipo_contrato} onChange={e => set("tipo_contrato", e.target.value)} style={IS}>
                {TIPOS_CONTRATO.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Modalidad</label>
              <select value={f.modalidad} onChange={e => set("modalidad", e.target.value)} style={IS}>
                {MODALIDADES.map(m => <option key={m.k} value={m.k}>{m.l}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Ubicación</label>
              <input value={f.ubicacion} onChange={e => set("ubicacion", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Cupos</label>
              <input type="number" value={f.vacantes_qty} onChange={e => set("vacantes_qty", e.target.value)} style={IS} min="1" />
            </div>
            <div>
              <label style={LS}>Fecha cierre (opcional)</label>
              <input type="date" value={f.fecha_cierre || ""} onChange={e => set("fecha_cierre", e.target.value)} style={IS} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Salario mín</label>
              <input type="number" value={f.salario_min} onChange={e => set("salario_min", e.target.value)} style={IS} placeholder="(opcional)" />
            </div>
            <div>
              <label style={LS}>Salario máx</label>
              <input type="number" value={f.salario_max} onChange={e => set("salario_max", e.target.value)} style={IS} placeholder="(opcional)" />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={!!f.salario_visible} onChange={e => set("salario_visible", e.target.checked)} />
                Mostrar en portal
              </label>
            </div>
          </div>

          <div>
            <label style={LS}>Descripción del puesto</label>
            <textarea value={f.descripcion} onChange={e => set("descripcion", e.target.value)} rows={3} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Resumen general del rol y la posición…" />
          </div>
          <div>
            <label style={LS}>Responsabilidades (una por línea)</label>
            <textarea value={f.responsabilidades} onChange={e => set("responsabilidades", e.target.value)} rows={4} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }}
              placeholder={"Liderar el equipo de…\nCoordinar con proveedores…\nReportar a Gerencia…"} />
          </div>
          <div>
            <label style={LS}>Requisitos (una por línea)</label>
            <textarea value={f.requisitos} onChange={e => set("requisitos", e.target.value)} rows={4} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }}
              placeholder={"3+ años de experiencia\nProfesional en…\nInglés intermedio"} />
          </div>
          <div>
            <label style={LS}>Beneficios (una por línea)</label>
            <textarea value={f.beneficios} onChange={e => set("beneficios", e.target.value)} rows={3} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }}
              placeholder={"Almuerzo incluido\nSeguro complementario\nDía libre cumpleaños"} />
          </div>

          <div style={{ background: B.navyMid, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LS}>Estado</label>
                <select value={f.estado} onChange={e => set("estado", e.target.value)} style={IS}>
                  <option value="abierta">Abierta</option>
                  <option value="pausada">Pausada</option>
                  <option value="cerrada">Cerrada</option>
                </select>
              </div>
              <div>
                <label style={LS}>Prioridad</label>
                <select value={f.prioridad} onChange={e => set("prioridad", e.target.value)} style={IS}>
                  <option value="alta">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, padding: "6px 0" }}>
              <input type="checkbox" checked={!!f.publicada} onChange={e => set("publicada", e.target.checked)} style={{ width: 18, height: 18 }} />
              <strong style={{ color: f.publicada ? "#22c55e" : "rgba(255,255,255,0.6)" }}>
                {f.publicada ? "🌐 Publicada en /carreras" : "📝 Borrador (no visible al público)"}
              </strong>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            {isEdit ? (
              <button type="button" onClick={eliminar} disabled={saving} style={{ ...BTN("transparent"), color: "#ef4444", border: `1px solid #ef4444aa` }}>🗑️ Eliminar</button>
            ) : <span />}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose} style={BTN(B.navyLight)} disabled={saving}>Cancelar</button>
              <button type="button" onClick={guardar} style={BTN(B.success)} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
