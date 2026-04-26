// MotoresTab.jsx — Mantenimiento preventivo de motores Yamaha 350 HP línea roja
// Sub-módulo dentro de Lancha. Maneja horómetros, alertas, órdenes de
// mantenimiento, repuestos y bloqueos operativos.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useMobile } from "../lib/useMobile";
import SignaturePad from "./SignaturePad";
import { generarPDFOT } from "../lib/motorPDF";

const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = (p) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const ESTADO_META = {
  operativo:        { label: "Operativo",          color: B.success, bg: B.success + "22", icon: "✅" },
  proximo:          { label: "Próximo a mant.",    color: B.warning, bg: B.warning + "22", icon: "⚠️" },
  vencido:          { label: "Mantenimiento vencido", color: "#f97316", bg: "#f9731622", icon: "🔧" },
  vencido_critico:  { label: "Vencido CRÍTICO",    color: B.danger,  bg: B.danger + "22",  icon: "🚨" },
  mantenimiento:    { label: "En mantenimiento",   color: B.sky,     bg: B.sky + "22",     icon: "🔩" },
  fuera_servicio:   { label: "Fuera de servicio",  color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", icon: "🛑" },
};

const TIPOS_MANT = [
  { k: "diario",     l: "Diario",    cada: 0,    alerta: 0 },
  { k: "50h",        l: "50 horas",  cada: 50,   alerta: 5 },
  { k: "100h",       l: "100 horas", cada: 100,  alerta: 10 },
  { k: "300h",       l: "300 horas", cada: 300,  alerta: 30 },
  { k: "500h",       l: "500 horas", cada: 500,  alerta: 50 },
  { k: "1000h",      l: "1000 horas",cada: 1000, alerta: 100 },
  { k: "correctivo", l: "Correctivo",cada: 0,    alerta: 0 },
];

// Checklists predefinidos (se guardan en motor_mantenimientos.checklist como objeto)
const CHECKLIST_DIARIO = [
  "Lavado con agua dulce / flushing",
  "Revisión visual de fugas",
  "Revisión de nivel de aceite",
  "Revisión de sistema de enfriamiento / chorro de agua",
  "Revisión de hélice",
  "Revisión de combustible",
  "Revisión de filtro separador de agua",
  "Revisión de batería",
];

const CHECKLIST_50H = [
  "Inspección general del motor",
  "Revisión de filtros de combustible",
  "Revisión de batería y conexiones",
  "Engrase de puntos móviles",
  "Inspección de ánodos",
  "Revisión de mangueras",
  "Revisión de corrosión",
  "Revisión de hélice y eje",
];

const CHECKLIST_100H = [
  "Cambio de aceite de motor",
  "Cambio de filtro de aceite",
  "Cambio de aceite de transmisión / lower unit",
  "Revisión o cambio de bujías",
  "Revisión o cambio de filtros de combustible",
  "Revisión de hélice",
  "Revisión de eje de hélice",
  "Engrase general",
  "Revisión de ánodos",
  "Revisión de correas",
  "Revisión de mangueras",
  "Revisión de sistema eléctrico",
  "Revisión de dirección",
  "Prueba de encendido",
  "Prueba en agua",
];

const CHECKLIST_300H = [...CHECKLIST_100H,
  "Cambio o revisión de impeller / bomba de agua",
  "Revisión de termostatos",
  "Revisión del sistema de enfriamiento",
  "Limpieza o revisión del sistema de inyección",
  "Revisión más profunda de sistema eléctrico",
  "Diagnóstico computarizado (si aplica)",
];

const CHECKLIST_500H = [...CHECKLIST_300H,
  "Inspección profunda de motor",
  "Revisión de sistema de dirección",
  "Revisión de sistema de combustible avanzado",
  "Revisión de sensores",
  "Revisión de conectores eléctricos",
  "Diagnóstico técnico general",
];

const CHECKLIST_1000H = [...CHECKLIST_500H,
  "Revisión estructural completa",
  "Revisión interna del motor",
  "Cambio o revisión de correas críticas",
  "Revisión de sistema de escape",
  "Informe técnico obligatorio",
  "Recomendación de continuidad operativa",
];

const CHECKLIST_BY_TIPO = {
  diario: CHECKLIST_DIARIO,
  "50h": CHECKLIST_50H,
  "100h": CHECKLIST_100H,
  "300h": CHECKLIST_300H,
  "500h": CHECKLIST_500H,
  "1000h": CHECKLIST_1000H,
  correctivo: [],
};

// Permisos por rol — usado para mostrar/ocultar acciones
function rolPermisos(rolId) {
  const r = String(rolId || "");
  return {
    // Cualquier rol puede registrar uso diario y checklist (incluso capitán)
    puede_uso: true,
    puede_checklist: true,
    // Crear OT: supervisor, gerente, admin, super_admin
    puede_crear_ot: /admin|gerente|super|supervisor/i.test(r),
    // Cerrar OT (finalizar): técnico, gerente, admin
    puede_cerrar_ot: /admin|gerente|super|tecnico/i.test(r),
    // Editar motor: gerente, admin
    puede_editar_motor: /admin|gerente|super/i.test(r),
    // Autorizar operación crítica: solo gerente o admin
    puede_autorizar: /admin|gerente|super/i.test(r),
  };
}

export default function MotoresTab({ activeLancha, lanchas }) {
  const { isMobile } = useMobile();
  const [motores, setMotores] = useState([]);
  const [usos, setUsos] = useState([]);
  const [mants, setMants] = useState([]);
  const [userRol, setUserRol] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { tipo, motor?, edit? }

  const perms = rolPermisos(userRol);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const email = session?.data?.session?.user?.email?.toLowerCase();
    if (email) {
      const { data: u } = await supabase.from("usuarios").select("rol_id").eq("email", email).maybeSingle();
      setUserRol(u?.rol_id || "");
    }
    const [mR, uR, ntR] = await Promise.all([
      supabase.from("lancha_motores").select("*").eq("activo", true).order("codigo"),
      supabase.from("motor_uso_diario").select("*").order("fecha", { ascending: false }).limit(200),
      supabase.from("motor_mantenimientos").select("*").order("fecha_apertura", { ascending: false }).limit(200),
    ]);
    setMotores(mR.data || []);
    setUsos(uR.data || []);
    setMants(ntR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const motoresLancha = useMemo(
    () => motores.filter(m => !activeLancha || m.lancha_id === activeLancha),
    [motores, activeLancha]
  );

  // KPIs globales
  const kpis = useMemo(() => {
    const all = motores;
    return {
      total: all.length,
      operativos: all.filter(m => m.estado === "operativo").length,
      proximos: all.filter(m => m.estado === "proximo").length,
      vencidos: all.filter(m => m.estado === "vencido" || m.estado === "vencido_critico").length,
      criticos: all.filter(m => m.estado === "vencido_critico").length,
      en_mant: all.filter(m => m.estado === "mantenimiento").length,
      fuera: all.filter(m => m.estado === "fuera_servicio").length,
      horas_total: all.reduce((s, m) => s + Number(m.horas_actuales || 0), 0),
    };
  }, [motores]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando motores…</div>;

  return (
    <div>
      {/* Header + KPIs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🛠️ Mantenimiento de motores</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
            Control de horas, intervalos y órdenes de mantenimiento por motor.
          </div>
        </div>
        {perms.puede_editar_motor && (
          <button onClick={() => setModal({ tipo: "motor", edit: null })}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            + Nuevo motor
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 120 : 150}px, 1fr))`, gap: 10, marginBottom: 18 }}>
        <Kpi l="Motores" v={kpis.total} c={B.sky} />
        <Kpi l="Operativos" v={kpis.operativos} c={B.success} />
        <Kpi l="Próx. mant." v={kpis.proximos} c={B.warning} />
        <Kpi l="Vencidos" v={kpis.vencidos} c="#f97316" />
        <Kpi l="🚨 Críticos" v={kpis.criticos} c={kpis.criticos > 0 ? B.danger : "rgba(255,255,255,0.4)"} />
        <Kpi l="Horas total" v={Math.round(kpis.horas_total).toLocaleString("es-CO")} c={B.sand} small />
      </div>

      {/* Lista de motores de la lancha activa */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {motoresLancha.length === 0 && (
          <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Esta embarcación no tiene motores registrados.
            <div style={{ fontSize: 11, marginTop: 6 }}>Click "+ Nuevo motor" para agregar uno.</div>
          </div>
        )}
        {motoresLancha.map(m => (
          <MotorCard key={m.id} motor={m} perms={perms}
            usos={usos.filter(u => u.motor_id === m.id)}
            mants={mants.filter(x => x.motor_id === m.id)}
            onUso={() => setModal({ tipo: "uso", motor: m })}
            onChecklist={() => setModal({ tipo: "checklist_diario", motor: m })}
            onMant={() => setModal({ tipo: "mantenimiento", motor: m })}
            onEdit={() => setModal({ tipo: "motor", edit: m })}
            onAutorizar={() => setModal({ tipo: "autorizar", motor: m })}
          />
        ))}
      </div>

      {/* ─── Bitácora + Dashboard ─────────────────────────────────────── */}
      <BitacoraDashboard motores={motores} usos={usos} mants={mants} activeLancha={activeLancha} />

      {/* Modales */}
      {modal?.tipo === "motor" && (
        <MotorModal edit={modal.edit} lanchas={lanchas} activeLancha={activeLancha}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {modal?.tipo === "uso" && (
        <UsoDiarioModal motor={modal.motor}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {modal?.tipo === "checklist_diario" && (
        <ChecklistDiarioModal motor={modal.motor}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {modal?.tipo === "mantenimiento" && (
        <MantenimientoModal motor={modal.motor}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {modal?.tipo === "autorizar" && (
        <AutorizacionModal motor={modal.motor}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

// ─── Card por motor con info y acciones ───────────────────────────────────
function MotorCard({ motor, perms = {}, usos, mants, onUso, onChecklist, onMant, onEdit, onAutorizar }) {
  const meta = ESTADO_META[motor.estado] || ESTADO_META.operativo;
  const horasActuales = Number(motor.horas_actuales) || 0;
  // Calcular próximos mantenimientos
  const proximos = [
    { k: "50h",   prox: (Number(motor.horas_ult_mant_50)   || 0) + 50,   ult: motor.horas_ult_mant_50 },
    { k: "100h",  prox: (Number(motor.horas_ult_mant_100)  || 0) + 100,  ult: motor.horas_ult_mant_100 },
    { k: "300h",  prox: (Number(motor.horas_ult_mant_300)  || 0) + 300,  ult: motor.horas_ult_mant_300 },
    { k: "500h",  prox: (Number(motor.horas_ult_mant_500)  || 0) + 500,  ult: motor.horas_ult_mant_500 },
    { k: "1000h", prox: (Number(motor.horas_ult_mant_1000) || 0) + 1000, ult: motor.horas_ult_mant_1000 },
  ];
  const masCercano = proximos.reduce((a, b) => (b.prox - horasActuales) < (a.prox - horasActuales) ? b : a, proximos[0]);
  const horasParaMant = masCercano.prox - horasActuales;

  const horasMes = usos.filter(u => (u.fecha || "").startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, u) => s + Number(u.horas_trabajadas || 0), 0);
  const ultUso = usos[0];
  const mantsAbiertas = mants.filter(m => m.estado !== "finalizada" && m.estado !== "cancelada").length;

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 14, borderLeft: `4px solid ${meta.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>⚙️ {motor.codigo || motor.id}</span>
            <span style={{ padding: "2px 8px", borderRadius: 4, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700 }}>
              {meta.icon} {meta.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            {motor.marca} · {motor.modelo}{motor.numero_serie ? ` · S/N ${motor.numero_serie}` : ""}
          </div>
        </div>
        {perms.puede_editar_motor && (
          <button onClick={onEdit}
            style={{ background: "transparent", border: `1px solid ${B.navyLight}`, borderRadius: 6, color: "rgba(255,255,255,0.6)", padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
            ✏️ Editar
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
        <Stat l="Horómetro" v={horasActuales.toFixed(1) + " h"} c={B.sky} />
        <Stat l="Próximo mant." v={`${masCercano.k} en ${horasParaMant.toFixed(0)}h`} c={horasParaMant <= 10 ? B.warning : B.sand} />
        <Stat l="Horas este mes" v={horasMes.toFixed(1) + " h"} c="rgba(255,255,255,0.7)" />
        <Stat l="Último uso" v={ultUso ? fmtFecha(ultUso.fecha) : "—"} c="rgba(255,255,255,0.5)" small />
        {mantsAbiertas > 0 && <Stat l="OTs abiertas" v={mantsAbiertas} c={B.warning} />}
      </div>

      {/* Tabla de próximos mantenimientos */}
      <div style={{ background: B.navy, borderRadius: 8, padding: 8, marginBottom: 12, fontSize: 11 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 4 }}>
          {proximos.map(p => {
            const delta = p.prox - horasActuales;
            const color = delta < -10 ? B.danger : delta < 0 ? "#f97316" : delta <= 10 ? B.warning : B.success;
            return (
              <div key={p.k} style={{ textAlign: "center", padding: "6px 4px", background: B.navyMid, borderRadius: 4, borderTop: `2px solid ${color}` }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{p.k}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color, marginTop: 2 }}>
                  {delta > 0 ? `${delta.toFixed(0)}h` : delta === 0 ? "AHORA" : `+${Math.abs(delta).toFixed(0)}h`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {motor.estado === "vencido_critico" && (
        <div style={{ background: B.danger + "22", border: `1px solid ${B.danger}55`, borderRadius: 6, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: B.danger }}>
          🚨 Mantenimiento crítico vencido. No debe operar sin {perms.puede_autorizar ? (
            <button onClick={onAutorizar}
              style={{ background: B.danger, border: "none", color: "#fff", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: 4 }}>
              🔓 Autorización gerencial
            </button>
          ) : <strong>autorización gerencial</strong>}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {perms.puede_uso && <button onClick={onUso} style={btnAction(B.sky)}>⏱ Registrar uso</button>}
        {perms.puede_checklist && <button onClick={onChecklist} style={btnAction(B.success)}>✅ Checklist diario</button>}
        {perms.puede_crear_ot && <button onClick={onMant} style={btnAction(B.warning)}>🔧 Orden de mantenimiento</button>}
      </div>
    </div>
  );
}

const btnAction = (color) => ({
  flex: 1, minWidth: 110, padding: "8px 12px", borderRadius: 6, border: `1px solid ${color}`,
  background: color + "22", color, fontSize: 11, fontWeight: 700, cursor: "pointer",
});

function Kpi({ l, v, c, small }) {
  return (
    <div style={{ background: B.navyMid, padding: small ? 8 : 10, borderRadius: 8, borderLeft: `3px solid ${c}` }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: small ? 14 : 18, fontWeight: 800, color: c, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function Stat({ l, v, c, small }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: small ? 11 : 13, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Crear/editar motor
// ═══════════════════════════════════════════════════════════════════════════
function MotorModal({ edit, lanchas, activeLancha, onClose, onSaved }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    lancha_id: edit?.lancha_id || activeLancha || lanchas[0]?.id || "",
    codigo: edit?.codigo || "",
    marca: edit?.marca || "Yamaha",
    modelo: edit?.modelo || "F350 / 350 HP línea roja",
    numero_serie: edit?.numero_serie || "",
    fecha_instalacion: edit?.fecha_instalacion || "",
    horas_iniciales: edit?.horas_iniciales || 0,
    horas_actuales: edit?.horas_actuales || 0,
    estado: edit?.estado || "operativo",
    notas: edit?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.lancha_id || !f.codigo) { setErr("Lancha y código son obligatorios"); return; }
    setSaving(true); setErr("");
    const payload = {
      lancha_id: f.lancha_id, codigo: f.codigo, marca: f.marca, modelo: f.modelo,
      numero_serie: f.numero_serie || null,
      fecha_instalacion: f.fecha_instalacion || null,
      horas_iniciales: Number(f.horas_iniciales) || 0,
      horas_actuales: Number(f.horas_actuales) || 0,
      estado: f.estado,
      notas: f.notas || null,
      updated_at: new Date().toISOString(),
    };
    let r;
    if (f.id) {
      r = await supabase.from("lancha_motores").update(payload).eq("id", f.id);
    } else {
      r = await supabase.from("lancha_motores").insert({ id: uid("MOT"), ...payload, activo: true });
    }
    if (r.error) { setErr(r.error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose} maxWidth={560}>
      <H3>{edit ? "Editar motor" : "Nuevo motor"}</H3>
      <Grid>
        <Field label="Lancha">
          <select value={f.lancha_id} onChange={e => set("lancha_id", e.target.value)} style={IS}>
            {lanchas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </Field>
        <Field label="Código (ej. Estribor, Babor, M1)">
          <input value={f.codigo} onChange={e => set("codigo", e.target.value)} style={IS} />
        </Field>
        <Field label="Marca"><input value={f.marca} onChange={e => set("marca", e.target.value)} style={IS} /></Field>
        <Field label="Modelo"><input value={f.modelo} onChange={e => set("modelo", e.target.value)} style={IS} /></Field>
        <Field label="Número de serie"><input value={f.numero_serie} onChange={e => set("numero_serie", e.target.value)} style={IS} /></Field>
        <Field label="Fecha de instalación"><input type="date" value={f.fecha_instalacion} onChange={e => set("fecha_instalacion", e.target.value)} style={IS} /></Field>
        <Field label="Horas iniciales (al instalar)"><input type="number" value={f.horas_iniciales} onChange={e => set("horas_iniciales", e.target.value)} style={IS} /></Field>
        <Field label="Horas actuales (horómetro)"><input type="number" value={f.horas_actuales} onChange={e => set("horas_actuales", e.target.value)} style={IS} /></Field>
        <Field label="Estado" full>
          <select value={f.estado} onChange={e => set("estado", e.target.value)} style={IS}>
            {Object.entries(ESTADO_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Notas" full><textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} /></Field>
      </Grid>
      <Actions onCancel={onClose} onSave={save} saving={saving} disabled={!f.codigo || !f.lancha_id} err={err} />
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Registrar uso diario
// ═══════════════════════════════════════════════════════════════════════════
function UsoDiarioModal({ motor, onClose, onSaved }) {
  const [f, setF] = useState({
    fecha: todayStr(),
    horometro_inicio: motor.horas_actuales || 0,
    horometro_fin: motor.horas_actuales || 0,
    ruta: "",
    capitan_nombre: "",
    observaciones: "",
    justificacion: "",
  });
  const [fotosUrls, setFotosUrls] = useState([]);
  const [firmaUrl, setFirmaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function addFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${motor.id}/uso-diario/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("motores").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("motores").getPublicUrl(path);
      setFotosUrls(p => [...p, pub.publicUrl]);
    } catch (er) { alert("Error: " + er.message); }
    setUploading(false);
  }

  const horasTrab = Math.max(0, Number(f.horometro_fin) - Number(f.horometro_inicio));
  const requiereJustificacion = horasTrab > 12 || horasTrab < 0; // anormal

  async function save() {
    if (Number(f.horometro_fin) < Number(f.horometro_inicio)) { setErr("Horómetro final no puede ser menor al inicial"); return; }
    if (requiereJustificacion && !f.justificacion.trim()) { setErr("Diferencia anormal de horas — escribe justificación"); return; }
    setSaving(true); setErr("");
    const r = await supabase.from("motor_uso_diario").insert({
      id: uid("USO"),
      motor_id: motor.id,
      lancha_id: motor.lancha_id,
      fecha: f.fecha,
      horometro_inicio: Number(f.horometro_inicio),
      horometro_fin: Number(f.horometro_fin),
      ruta: f.ruta || null,
      capitan_nombre: f.capitan_nombre || null,
      observaciones: f.observaciones || null,
      justificacion: f.justificacion || null,
      fotos_urls: fotosUrls,
      firma_url: firmaUrl || null,
    });
    if (r.error) { setErr(r.error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <H3>⏱ Registrar uso diario — {motor.codigo}</H3>
      <Grid>
        <Field label="Fecha"><input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={IS} /></Field>
        <Field label="Capitán"><input value={f.capitan_nombre} onChange={e => set("capitan_nombre", e.target.value)} placeholder="Nombre del capitán" style={IS} /></Field>
        <Field label="Horómetro inicio"><input type="number" value={f.horometro_inicio} onChange={e => set("horometro_inicio", e.target.value)} style={IS} /></Field>
        <Field label="Horómetro fin"><input type="number" value={f.horometro_fin} onChange={e => set("horometro_fin", e.target.value)} style={IS} /></Field>
        <Field label="Horas trabajadas (calculado)" full>
          <div style={{ ...IS, background: B.navy, color: requiereJustificacion ? B.warning : B.success, fontWeight: 700 }}>
            {horasTrab.toFixed(1)} h {requiereJustificacion && "⚠️ ANORMAL"}
          </div>
        </Field>
        <Field label="Ruta / servicio realizado" full><input value={f.ruta} onChange={e => set("ruta", e.target.value)} placeholder="Ej: Cartagena-Atolón ida+vuelta" style={IS} /></Field>
        <Field label="Observaciones" full><textarea value={f.observaciones} onChange={e => set("observaciones", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} /></Field>
        {requiereJustificacion && (
          <Field label="Justificación obligatoria (diferencia anormal)" full>
            <textarea value={f.justificacion} onChange={e => set("justificacion", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical", borderColor: B.warning }} />
          </Field>
        )}
        <Field label="Fotos opcionales" full>
          <input type="file" accept="image/*" capture="environment" onChange={addFoto} disabled={uploading}
            style={{ fontSize: 11, color: "#fff" }} />
          {fotosUrls.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {fotosUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 4 }} />
                </a>
              ))}
            </div>
          )}
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <SignaturePad value={firmaUrl} onChange={setFirmaUrl} path={`${motor.id}/firmas-uso`} label="Firma del capitán" />
        </div>
      </Grid>
      <Actions onCancel={onClose} onSave={save} saving={saving} err={err} />
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Checklist diario
// ═══════════════════════════════════════════════════════════════════════════
function ChecklistDiarioModal({ motor, onClose, onSaved }) {
  const [items, setItems] = useState(() => Object.fromEntries(CHECKLIST_DIARIO.map(k => [k, { ok: false, nota: "" }])));
  const [obs, setObs] = useState("");
  const [capitan, setCapitan] = useState("");
  const [firmaUrl, setFirmaUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const todosOk = Object.values(items).every(x => x.ok);

  async function save() {
    setSaving(true); setErr("");
    const r = await supabase.from("motor_checklist_diario").insert({
      id: uid("CHK"),
      motor_id: motor.id,
      fecha: todayStr(),
      capitan_nombre: capitan || null,
      items: { ...items, _firma_url: firmaUrl || null },
      observaciones: obs || null,
      completado: todosOk,
    });
    if (r.error) { setErr(r.error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose} maxWidth={560}>
      <H3>✅ Checklist diario — {motor.codigo}</H3>
      <Field label="Capitán" full><input value={capitan} onChange={e => setCapitan(e.target.value)} style={IS} /></Field>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {CHECKLIST_DIARIO.map(item => (
          <label key={item} style={{ display: "flex", gap: 10, padding: 10, background: items[item]?.ok ? B.success + "11" : B.navy, borderRadius: 6, cursor: "pointer", alignItems: "center" }}>
            <input type="checkbox" checked={items[item]?.ok || false}
              onChange={e => setItems(prev => ({ ...prev, [item]: { ...prev[item], ok: e.target.checked } }))} />
            <span style={{ fontSize: 13, flex: 1 }}>{item}</span>
            <input value={items[item]?.nota || ""} placeholder="Nota..."
              onChange={e => setItems(prev => ({ ...prev, [item]: { ...prev[item], nota: e.target.value } }))}
              style={{ ...IS, padding: "6px 8px", fontSize: 11, width: 180 }} />
          </label>
        ))}
      </div>
      <Field label="Observaciones generales" full>
        <textarea value={obs} onChange={e => setObs(e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} />
      </Field>
      <div style={{ marginTop: 12 }}>
        <SignaturePad value={firmaUrl} onChange={setFirmaUrl} path={`${motor.id}/firmas-checklist`} label="Firma del capitán" />
      </div>
      <div style={{ fontSize: 11, color: todosOk ? B.success : B.warning, padding: "8px 0" }}>
        {todosOk ? "✓ Checklist completo" : `Faltan ${Object.values(items).filter(i => !i.ok).length} items`}
      </div>
      <Actions onCancel={onClose} onSave={save} saving={saving} err={err} />
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Crear orden de mantenimiento
// ═══════════════════════════════════════════════════════════════════════════
function MantenimientoModal({ motor, onClose, onSaved }) {
  const [f, setF] = useState({
    tipo: "100h",
    estado: "abierta",
    fecha_apertura: todayStr(),
    fecha_cierre: "",
    horas_motor_apertura: motor.horas_actuales || 0,
    horas_motor_cierre: "",
    responsable: "",
    tecnico_nombre: "",
    factura_numero: "",
    factura_proveedor: "",
    costo_repuestos: 0,
    costo_mano_obra: 0,
    observaciones: "",
    notas_cierre: "",
  });
  const [checklist, setChecklist] = useState({});
  const [repuestos, setRepuestos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [bodegaDefault, setBodegaDefault] = useState("LOC-MANTENIMIENTO");
  const [fotosUrls, setFotosUrls] = useState([]);
  const [facturaUrl, setFacturaUrl] = useState("");
  const [firmaTecnicoUrl, setFirmaTecnicoUrl] = useState("");
  const [firmaSupUrl, setFirmaSupUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Cargar catálogo de items + bodegas para repuestos
  useEffect(() => {
    Promise.all([
      supabase.from("items_catalogo").select("id, nombre, unidad, precio_compra, categoria").eq("activo", true).order("nombre"),
      supabase.from("items_locaciones").select("id, nombre, icono").eq("activa", true).order("orden"),
    ]).then(([cR, lR]) => {
      setCatalogo(cR.data || []);
      setBodegas(lR.data || []);
      // Default: Mantenimiento si existe, sino Almacén Bar
      const mant = (lR.data || []).find(b => b.id === "LOC-MANTENIMIENTO");
      const bar = (lR.data || []).find(b => b.id === "LOC-ALMACEN-BAR");
      setBodegaDefault(mant?.id || bar?.id || (lR.data || [])[0]?.id || "");
    });
  }, []);

  async function uploadFile(file, prefix) {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${motor.id}/${prefix}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from("motores").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("motores").getPublicUrl(path);
      return pub.publicUrl;
    } finally {
      setUploading(false);
    }
  }
  async function addFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file, "ot-fotos");
      setFotosUrls(prev => [...prev, url]);
    } catch (err) { alert("Error subiendo: " + err.message); }
  }
  async function uploadFactura(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setFacturaUrl(await uploadFile(file, "ot-facturas")); }
    catch (err) { alert("Error subiendo: " + err.message); }
  }

  // Reset checklist al cambiar tipo
  useEffect(() => {
    const items = CHECKLIST_BY_TIPO[f.tipo] || [];
    setChecklist(Object.fromEntries(items.map(it => [it, { ok: false, nota: "" }])));
  }, [f.tipo]);

  const addRepuesto = () => setRepuestos(r => [...r, {
    id: uid("RP"),
    item_id: null,
    nombre: "",
    cantidad: 1,
    costo_unit: 0,
    proveedor: "",
    locacion_id: bodegaDefault,
    descontado: false,
  }]);
  const setRep = (i, k, v) => setRepuestos(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const pickRepuestoItem = (i, item) => setRepuestos(r => r.map((x, j) => j === i ? {
    ...x,
    item_id: item?.id || null,
    nombre: item?.nombre || "",
    costo_unit: x.costo_unit || Number(item?.precio_compra) || 0,
  } : x));
  const delRep = (i) => setRepuestos(r => r.filter((_, j) => j !== i));
  const costoRep = repuestos.reduce((s, x) => s + ((Number(x.cantidad) || 0) * (Number(x.costo_unit) || 0)), 0);
  const costoTotal = costoRep + (Number(f.costo_mano_obra) || 0);

  async function save() {
    setSaving(true); setErr("");
    const numero = `OT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const repsPayload = repuestos.map(x => ({
      id: x.id,
      item_id: x.item_id || null,
      nombre: x.nombre,
      cantidad: Number(x.cantidad) || 0,
      costo_unit: Number(x.costo_unit) || 0,
      costo_total: (Number(x.cantidad) || 0) * (Number(x.costo_unit) || 0),
      proveedor: x.proveedor || null,
      locacion_id: x.locacion_id || null,
      descontado: false, // el trigger lo marcará en true cuando finalice la OT
    }));
    const r = await supabase.from("motor_mantenimientos").insert({
      id: uid("MNT"),
      numero,
      motor_id: motor.id,
      lancha_id: motor.lancha_id,
      tipo: f.tipo,
      estado: f.estado,
      fecha_apertura: f.fecha_apertura,
      fecha_cierre: f.estado === "finalizada" ? (f.fecha_cierre || todayStr()) : null,
      horas_motor_apertura: Number(f.horas_motor_apertura) || 0,
      horas_motor_cierre: f.estado === "finalizada" ? (Number(f.horas_motor_cierre) || Number(f.horas_motor_apertura)) : null,
      responsable: f.responsable || null,
      tecnico_nombre: f.tecnico_nombre || null,
      checklist,
      repuestos: repsPayload,
      costo_repuestos: costoRep,
      costo_mano_obra: Number(f.costo_mano_obra) || 0,
      factura_numero: f.factura_numero || null,
      factura_proveedor: f.factura_proveedor || null,
      factura_url: facturaUrl || null,
      fotos_urls: fotosUrls,
      firma_tecnico_url: firmaTecnicoUrl || null,
      firma_supervisor_url: firmaSupUrl || null,
      observaciones: f.observaciones || null,
      notas_cierre: f.estado === "finalizada" ? (f.notas_cierre || null) : null,
    });
    if (r.error) { setErr(r.error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  const checklistItems = CHECKLIST_BY_TIPO[f.tipo] || [];

  return (
    <Overlay onClose={onClose} maxWidth={780}>
      <H3>🔧 Orden de mantenimiento — {motor.codigo}</H3>
      <Grid>
        <Field label="Tipo">
          <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
            {TIPOS_MANT.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select value={f.estado} onChange={e => set("estado", e.target.value)} style={IS}>
            <option value="abierta">Abierta</option>
            <option value="en_proceso">En proceso</option>
            <option value="pendiente_repuesto">Pendiente repuesto</option>
            <option value="finalizada">Finalizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </Field>
        <Field label="Fecha apertura"><input type="date" value={f.fecha_apertura} onChange={e => set("fecha_apertura", e.target.value)} style={IS} /></Field>
        <Field label="Horas motor (apertura)"><input type="number" value={f.horas_motor_apertura} onChange={e => set("horas_motor_apertura", e.target.value)} style={IS} /></Field>
        <Field label="Responsable / supervisor"><input value={f.responsable} onChange={e => set("responsable", e.target.value)} style={IS} /></Field>
        <Field label="Técnico asignado"><input value={f.tecnico_nombre} onChange={e => set("tecnico_nombre", e.target.value)} style={IS} /></Field>
        {f.estado === "finalizada" && (
          <>
            <Field label="Fecha cierre"><input type="date" value={f.fecha_cierre} onChange={e => set("fecha_cierre", e.target.value)} style={IS} /></Field>
            <Field label="Horas motor (cierre)"><input type="number" value={f.horas_motor_cierre} onChange={e => set("horas_motor_cierre", e.target.value)} style={IS} /></Field>
          </>
        )}
      </Grid>

      {/* Checklist */}
      {checklistItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", marginBottom: 6 }}>Checklist técnico ({f.tipo})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", padding: 6, background: B.navy, borderRadius: 8 }}>
            {checklistItems.map(it => (
              <label key={it} style={{ display: "flex", gap: 8, padding: 6, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={checklist[it]?.ok || false}
                  onChange={e => setChecklist(prev => ({ ...prev, [it]: { ...prev[it], ok: e.target.checked } }))} />
                <span style={{ flex: 1 }}>{it}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Repuestos */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase" }}>Repuestos</span>
          <button onClick={addRepuesto} style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Repuesto</button>
        </div>
        {repuestos.length === 0 ? (
          <div style={{ padding: 12, background: B.navy, borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
            Sin repuestos. Si los agregas y vinculas al catálogo, al cerrar la OT se descuentan automáticamente del inventario.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 0.6fr 1fr 1fr 28px", gap: 4, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", padding: "0 6px" }}>
              <span>Repuesto (catálogo)</span><span>Bodega</span><span>Cant</span><span>$ Unit</span><span>Subtotal · Proveedor</span><span></span>
            </div>
            {repuestos.map((rep, i) => {
              const subtotal = (Number(rep.cantidad) || 0) * (Number(rep.costo_unit) || 0);
              return (
                <div key={rep.id} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 0.6fr 1fr 1fr 28px", gap: 4, padding: 6, background: B.navy, borderRadius: 6, alignItems: "center" }}>
                  {/* Item del catálogo (autocomplete simple via select) */}
                  <select value={rep.item_id || ""}
                    onChange={e => {
                      const sel = catalogo.find(x => x.id === e.target.value);
                      pickRepuestoItem(i, sel || null);
                    }}
                    style={{ ...IS, padding: "5px 6px", fontSize: 11 }}>
                    <option value="">— libre / sin catálogo —</option>
                    {catalogo.map(it => <option key={it.id} value={it.id}>{it.nombre}{it.unidad ? ` (${it.unidad})` : ""}</option>)}
                  </select>
                  {!rep.item_id && (
                    <input value={rep.nombre} onChange={e => setRep(i, "nombre", e.target.value)} placeholder="Nombre libre" style={{ ...IS, padding: "5px 6px", fontSize: 11, gridColumn: "1" }} />
                  )}
                  <select value={rep.locacion_id || ""}
                    onChange={e => setRep(i, "locacion_id", e.target.value)}
                    style={{ ...IS, padding: "5px 6px", fontSize: 11 }}>
                    {bodegas.map(b => <option key={b.id} value={b.id}>{b.icono || "📦"} {b.nombre}</option>)}
                  </select>
                  <input type="number" value={rep.cantidad} onChange={e => setRep(i, "cantidad", e.target.value)} style={{ ...IS, padding: "5px 6px", fontSize: 11, textAlign: "right" }} />
                  <input type="number" value={rep.costo_unit} onChange={e => setRep(i, "costo_unit", e.target.value)} placeholder="$/u" style={{ ...IS, padding: "5px 6px", fontSize: 11, textAlign: "right" }} />
                  <div style={{ fontSize: 10, padding: "2px 0" }}>
                    <div style={{ color: B.sand, fontWeight: 700, textAlign: "right" }}>{fmtCOP(subtotal)}</div>
                    <input value={rep.proveedor} onChange={e => setRep(i, "proveedor", e.target.value)} placeholder="Proveedor"
                      style={{ ...IS, padding: "3px 5px", fontSize: 10, marginTop: 2 }} />
                  </div>
                  <button onClick={() => delRep(i)} style={{ background: "transparent", border: "none", color: B.danger, fontSize: 14, cursor: "pointer" }}>✕</button>
                </div>
              );
            })}
            {f.estado !== "finalizada" && repuestos.some(r => r.item_id) && (
              <div style={{ fontSize: 10, color: B.sky, padding: "4px 6px" }}>
                ℹ️ {repuestos.filter(r => r.item_id).length} repuesto{repuestos.filter(r => r.item_id).length !== 1 ? "s" : ""} vinculado{repuestos.filter(r => r.item_id).length !== 1 ? "s" : ""} al catálogo · al cerrar la OT se descontarán del inventario.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Adjuntos: fotos + factura */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Fotos ({fotosUrls.length})</div>
          <input type="file" accept="image/*" capture="environment" onChange={addFoto} disabled={uploading}
            style={{ fontSize: 10, color: "#fff", marginBottom: 6 }} />
          {fotosUrls.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {fotosUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" style={{ position: "relative" }}>
                  <img src={u} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 4 }} />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Factura / soporte</div>
          {facturaUrl ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
              <a href={facturaUrl} target="_blank" rel="noreferrer" style={{ color: B.sky }}>📎 Ver factura</a>
              <button onClick={() => setFacturaUrl("")} style={{ background: "transparent", border: "none", color: B.danger, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ) : (
            <input type="file" accept="image/*,application/pdf" onChange={uploadFactura} disabled={uploading}
              style={{ fontSize: 10, color: "#fff" }} />
          )}
        </div>
      </div>

      <Grid>
        <Field label="Mano de obra (COP)"><input type="number" value={f.costo_mano_obra} onChange={e => set("costo_mano_obra", e.target.value)} style={IS} /></Field>
        <Field label="Costo total (calculado)" full>
          <div style={{ ...IS, background: B.navy, color: B.danger, fontWeight: 800 }}>
            {fmtCOP(costoTotal)} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>= {fmtCOP(costoRep)} repuestos + {fmtCOP(f.costo_mano_obra)} mano obra</span>
          </div>
        </Field>
        <Field label="Factura número"><input value={f.factura_numero} onChange={e => set("factura_numero", e.target.value)} style={IS} /></Field>
        <Field label="Proveedor factura"><input value={f.factura_proveedor} onChange={e => set("factura_proveedor", e.target.value)} style={IS} /></Field>
        <Field label="Observaciones" full><textarea value={f.observaciones} onChange={e => set("observaciones", e.target.value)} style={{ ...IS, minHeight: 50, resize: "vertical" }} /></Field>
        {f.estado === "finalizada" && (
          <Field label="Notas de cierre" full><textarea value={f.notas_cierre} onChange={e => set("notas_cierre", e.target.value)} style={{ ...IS, minHeight: 50, resize: "vertical" }} /></Field>
        )}
      </Grid>

      {/* Firmas */}
      {f.estado === "finalizada" && (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <SignaturePad value={firmaTecnicoUrl} onChange={setFirmaTecnicoUrl} path={`${motor.id}/firmas-tecnico`} label="Firma del técnico" />
          <SignaturePad value={firmaSupUrl} onChange={setFirmaSupUrl} path={`${motor.id}/firmas-supervisor`} label="Firma del supervisor" />
        </div>
      )}
      <Actions onCancel={onClose} onSave={save} saving={saving} err={err} />
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Autorización gerencial para operar con mantenimiento crítico vencido
// ═══════════════════════════════════════════════════════════════════════════
function AutorizacionModal({ motor, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [gerente, setGerente] = useState("");
  const [vigencia, setVigencia] = useState(10);
  const [firmaUrl, setFirmaUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (motivo.trim().length < 15) { setErr("Motivo obligatorio (mínimo 15 caracteres)"); return; }
    if (!gerente.trim()) { setErr("Nombre del gerente obligatorio"); return; }
    if (!firmaUrl) { setErr("Firma del gerente obligatoria"); return; }
    setSaving(true); setErr("");
    const r = await supabase.from("motor_autorizaciones").insert({
      id: uid("AUT"),
      motor_id: motor.id,
      horas_al_autorizar: Number(motor.horas_actuales) || 0,
      motivo,
      gerente_nombre: gerente,
      vigencia_horas: Number(vigencia) || 10,
      firma_url: firmaUrl,
    });
    if (r.error) { setErr(r.error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <H3 color={B.danger}>🔓 Autorización gerencial — {motor.codigo}</H3>
      <div style={{ background: B.danger + "11", border: `1px solid ${B.danger}55`, borderRadius: 8, padding: 12, fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>
        ⚠️ Este motor tiene mantenimiento crítico vencido. La autorización queda registrada en auditoría con tu nombre, fecha y motivo.
      </div>
      <Field label="Gerente que autoriza" full><input value={gerente} onChange={e => setGerente(e.target.value)} style={IS} /></Field>
      <Field label="Motivo (mín. 15 caracteres)" full>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe por qué se autoriza la operación excepcional..."
          style={{ ...IS, minHeight: 80, resize: "vertical" }} />
        <div style={{ fontSize: 10, color: motivo.trim().length >= 15 ? B.success : "rgba(255,255,255,0.4)", marginTop: 2 }}>
          {motivo.trim().length}/15
        </div>
      </Field>
      <Field label="Vigencia (horas adicionales)" full><input type="number" value={vigencia} onChange={e => setVigencia(e.target.value)} style={IS} /></Field>
      <div style={{ marginTop: 14 }}>
        <SignaturePad value={firmaUrl} onChange={setFirmaUrl} path={`${motor.id}/firmas-gerente`} label="Firma del gerente (obligatoria)" />
      </div>
      <Actions onCancel={onClose} onSave={save} saving={saving} err={err} saveLabel="🔓 Autorizar operación" saveColor={B.danger} />
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UI helpers
// ═══════════════════════════════════════════════════════════════════════════
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 };

const H3 = ({ children, color }) => <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: color || B.white }}>{children}</h3>;
const Grid = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
const Field = ({ label, full, children }) => <div style={{ gridColumn: full ? "1 / -1" : undefined }}><label style={LS}>{label}</label>{children}</div>;
const Actions = ({ onCancel, onSave, saving, disabled, err, saveLabel = "Guardar", saveColor = B.success }) => (
  <>
    {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: "#fca5a5", borderRadius: 8, fontSize: 12 }}>{err}</div>}
    <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
      <button onClick={onCancel} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
      <button onClick={onSave} disabled={saving || disabled}
        style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: saveColor, color: saveColor === B.danger ? "#fff" : B.navy, cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: (saving || disabled) ? 0.5 : 1 }}>
        {saving ? "Guardando…" : saveLabel}
      </button>
    </div>
  </>
);

// ═══════════════════════════════════════════════════════════════════════════
// BITÁCORA + DASHBOARD (historial, ranking, exportar)
// ═══════════════════════════════════════════════════════════════════════════
function BitacoraDashboard({ motores, usos, mants, activeLancha }) {
  const [filtro, setFiltro] = useState("todos"); // todos | activeLancha
  const [vista, setVista] = useState("usos"); // usos | mants | dashboard

  const motoresVisibles = filtro === "esta_lancha" && activeLancha
    ? motores.filter(m => m.lancha_id === activeLancha)
    : motores;
  const motorIds = motoresVisibles.map(m => m.id);
  const usosFiltrados = usos.filter(u => motorIds.includes(u.motor_id));
  const mantsFiltrados = mants.filter(m => motorIds.includes(m.motor_id));

  // Ranking: motor con más horas, motor con más costo
  const rankingHoras = [...motoresVisibles].sort((a, b) => Number(b.horas_actuales || 0) - Number(a.horas_actuales || 0)).slice(0, 5);
  const costosPorMotor = motoresVisibles.map(m => ({
    motor: m,
    costo: mantsFiltrados.filter(x => x.motor_id === m.id).reduce((s, x) => s + Number(x.costo_total || 0), 0),
    ots: mantsFiltrados.filter(x => x.motor_id === m.id).length,
  })).sort((a, b) => b.costo - a.costo);

  // Horas mes (últimos 6 meses) por motor
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    meses.push(d.toISOString().slice(0, 7));
  }
  const horasPorMes = meses.map(ym => {
    const total = usosFiltrados
      .filter(u => (u.fecha || "").startsWith(ym))
      .reduce((s, u) => s + Number(u.horas_trabajadas || 0), 0);
    return { mes: ym, horas: total };
  });
  const maxHoras = Math.max(1, ...horasPorMes.map(h => h.horas));

  // Próximos mantenimientos (top 10 por urgencia)
  const proximosList = motoresVisibles.flatMap(m => {
    const intervalos = [
      { tipo: "50h",   ult: m.horas_ult_mant_50,   cada: 50   },
      { tipo: "100h",  ult: m.horas_ult_mant_100,  cada: 100  },
      { tipo: "300h",  ult: m.horas_ult_mant_300,  cada: 300  },
      { tipo: "500h",  ult: m.horas_ult_mant_500,  cada: 500  },
      { tipo: "1000h", ult: m.horas_ult_mant_1000, cada: 1000 },
    ];
    return intervalos.map(it => ({
      motor: m,
      tipo: it.tipo,
      proxHoras: (Number(it.ult) || 0) + it.cada,
      delta: ((Number(it.ult) || 0) + it.cada) - Number(m.horas_actuales || 0),
    }));
  }).sort((a, b) => a.delta - b.delta).slice(0, 10);

  // Exportar CSV
  function exportarCSV(tipo) {
    let rows = [];
    let header = [];
    if (tipo === "usos") {
      header = ["Fecha", "Lancha", "Motor", "Capitán", "Horómetro inicio", "Horómetro fin", "Horas trabajadas", "Ruta", "Observaciones"];
      rows = usosFiltrados.map(u => {
        const m = motoresVisibles.find(x => x.id === u.motor_id) || {};
        return [u.fecha, m.lancha_id, m.codigo, u.capitan_nombre || "", u.horometro_inicio, u.horometro_fin, u.horas_trabajadas, u.ruta || "", (u.observaciones || "").replace(/[\n,;]/g, " ")];
      });
    } else if (tipo === "mants") {
      header = ["Número", "Fecha apertura", "Fecha cierre", "Lancha", "Motor", "Tipo", "Estado", "Técnico", "Horas mot.", "Costo total", "Factura", "Observaciones"];
      rows = mantsFiltrados.map(x => {
        const m = motoresVisibles.find(mt => mt.id === x.motor_id) || {};
        return [x.numero, x.fecha_apertura, x.fecha_cierre || "", m.lancha_id, m.codigo, x.tipo, x.estado, x.tecnico_nombre || "", x.horas_motor_apertura, x.costo_total, x.factura_numero || "", (x.observaciones || "").replace(/[\n,;]/g, " ")];
      });
    }
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `motores-${tipo}-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function imprimirPDF() {
    window.print();
  }

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${B.navyLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>📊 Bitácora & Dashboard</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Historial completo, ranking y reportes exportables.</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...IS, padding: "6px 10px", fontSize: 11, width: "auto" }}>
            <option value="todos">Toda la flota</option>
            <option value="esta_lancha">Solo esta lancha</option>
          </select>
          <button onClick={() => exportarCSV("usos")} style={btnExport(B.sky)}>📥 CSV Usos</button>
          <button onClick={() => exportarCSV("mants")} style={btnExport(B.warning)}>📥 CSV OTs</button>
          <button onClick={imprimirPDF} style={btnExport(B.success)}>🖨️ Imprimir</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[
          { k: "dashboard", l: "📊 Dashboard" },
          { k: "usos", l: `⏱ Usos (${usosFiltrados.length})` },
          { k: "mants", l: `🔧 OTs (${mantsFiltrados.length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setVista(t.k)}
            style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${vista === t.k ? B.sky : B.navyLight}`, background: vista === t.k ? B.sky + "22" : B.navyMid, color: vista === t.k ? B.sky : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {t.l}
          </button>
        ))}
      </div>

      {vista === "dashboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {/* Horas por mes (gráfico simple) */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Horas trabajadas — últimos 6 meses</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 130 }}>
              {horasPorMes.map(h => {
                const alto = (h.horas / maxHoras) * 100;
                return (
                  <div key={h.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", maxWidth: 28, height: 100, display: "flex", alignItems: "flex-end" }}>
                      <div style={{ width: "100%", background: B.sky, height: alto, minHeight: h.horas > 0 ? 2 : 0, borderRadius: "3px 3px 0 0" }} title={`${h.horas.toFixed(1)}h`} />
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{h.mes.slice(5)}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: B.sand }}>{h.horas.toFixed(0)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ranking horas */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🏆 Ranking horas motor</div>
            {rankingHoras.length === 0 ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sin datos.</div>
            ) : rankingHoras.map((m, i) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: i < rankingHoras.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span>{i + 1}. {m.codigo}</span>
                <strong style={{ color: B.sky }}>{Number(m.horas_actuales || 0).toFixed(1)}h</strong>
              </div>
            ))}
          </div>

          {/* Ranking costos */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>💰 Costo de mantenimiento</div>
            {costosPorMotor.length === 0 ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sin OTs.</div>
            ) : costosPorMotor.map((x, i) => (
              <div key={x.motor.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: i < costosPorMotor.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span>{x.motor.codigo} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>({x.ots} OTs)</span></span>
                <strong style={{ color: B.warning }}>{fmtCOP(x.costo)}</strong>
              </div>
            ))}
          </div>

          {/* Próximos mantenimientos */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 14, gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚠️ Próximos mantenimientos (más urgentes)</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: B.navy }}>
                    {["Motor", "Tipo", "Horas actuales", "Próx. en", "Delta", "Estado"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: B.sand, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proximosList.map((p, i) => {
                    const color = p.delta < -10 ? B.danger : p.delta < 0 ? "#f97316" : p.delta <= 10 ? B.warning : B.success;
                    return (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "5px 10px" }}>{p.motor.codigo}</td>
                        <td style={{ padding: "5px 10px" }}>{p.tipo}</td>
                        <td style={{ padding: "5px 10px" }}>{Number(p.motor.horas_actuales || 0).toFixed(1)}h</td>
                        <td style={{ padding: "5px 10px" }}>{p.proxHoras.toFixed(0)}h</td>
                        <td style={{ padding: "5px 10px", color, fontWeight: 700 }}>{p.delta > 0 ? `${p.delta.toFixed(0)}h` : `+${Math.abs(p.delta).toFixed(0)}h vencido`}</td>
                        <td style={{ padding: "5px 10px" }}>
                          <span style={{ padding: "2px 6px", borderRadius: 3, background: color + "33", color, fontSize: 9, fontWeight: 700 }}>
                            {p.delta < -10 ? "CRÍTICO" : p.delta < 0 ? "VENCIDO" : p.delta <= 10 ? "PRÓXIMO" : "OK"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {vista === "usos" && (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          {usosFiltrados.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin registros de uso.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: B.navy }}>
                    {["Fecha", "Motor", "Capitán", "Inicio", "Fin", "Horas", "Ruta"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: B.sand, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usosFiltrados.slice(0, 50).map(u => {
                    const m = motoresVisibles.find(x => x.id === u.motor_id) || {};
                    return (
                      <tr key={u.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "6px 10px" }}>{u.fecha}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 700 }}>{m.codigo || "—"}</td>
                        <td style={{ padding: "6px 10px" }}>{u.capitan_nombre || "—"}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{Number(u.horometro_inicio || 0).toFixed(1)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{Number(u.horometro_fin || 0).toFixed(1)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: B.sky }}>{Number(u.horas_trabajadas || 0).toFixed(1)}h</td>
                        <td style={{ padding: "6px 10px", color: "rgba(255,255,255,0.6)" }}>{u.ruta || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {vista === "mants" && (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          {mantsFiltrados.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin órdenes de mantenimiento.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: B.navy }}>
                    {["Número", "Fecha", "Motor", "Tipo", "Estado", "Técnico", "Costo", "Factura", ""].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: B.sand, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mantsFiltrados.slice(0, 50).map(x => {
                    const m = motoresVisibles.find(mt => mt.id === x.motor_id) || {};
                    const estadoColor = x.estado === "finalizada" ? B.success : x.estado === "cancelada" ? B.danger : B.warning;
                    return (
                      <tr key={x.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 700 }}>{x.numero}</td>
                        <td style={{ padding: "6px 10px" }}>{x.fecha_apertura}</td>
                        <td style={{ padding: "6px 10px" }}>{m.codigo || "—"}</td>
                        <td style={{ padding: "6px 10px" }}>{x.tipo}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{ padding: "2px 6px", borderRadius: 3, background: estadoColor + "22", color: estadoColor, fontSize: 9, fontWeight: 700 }}>
                            {x.estado}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px" }}>{x.tecnico_nombre || "—"}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: B.warning }}>{fmtCOP(x.costo_total)}</td>
                        <td style={{ padding: "6px 10px" }}>{x.factura_numero || "—"}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <button onClick={() => generarPDFOT({ ot: x, motor: m, lancha: { id: m.lancha_id, nombre: m.lancha_id } })}
                            title="Descargar PDF"
                            style={{ background: B.sky + "22", border: `1px solid ${B.sky}`, color: B.sky, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
                            📄 PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
const btnExport = (color) => ({
  padding: "6px 12px", borderRadius: 6, border: `1px solid ${color}`,
  background: color + "22", color, fontSize: 11, fontWeight: 700, cursor: "pointer",
});

function Overlay({ children, onClose, maxWidth = 600 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 22, width: "100%", maxWidth, marginTop: 30, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {children}
      </div>
    </div>
  );
}
