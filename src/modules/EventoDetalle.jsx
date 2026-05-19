// EventoDetalle.jsx — Pantalla completa de planificación de evento
// Timeline, transporte, contactos, dietas, modo staff, bitácora
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, COP as COPbrand, fmtFecha, todayStr } from "../brand";
// COP por defecto (file-level): el módulo lo usa fuera de TabServicios.
// TabServicios redefine COP localmente cuando ocultarPrecios=true.
const COP = COPbrand;
import { useMobile } from "../lib/useMobile";
import GrupoCotizacionModal from "./grupos/GrupoCotizacionModal";
import InstructivoContratistasPDF from "./eventos/InstructivoContratistasPDF";
import FacturaElectronicaForm, { FacturaElectronicaToggle, FE_EMPTY, feValidate, fePayload } from "../lib/FacturaElectronicaForm.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const IS  = { background: "#1E3566", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
const LS  = { fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" };
const BTN = (bg = B.sky, col = "#fff") => ({ background: bg, color: col, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" });
const nowHH = () => { const d = new Date(); return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); };
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Tipos de bloque de timeline ──────────────────────────────────────────────
const TIPOS_TIMELINE = [
  { key: "llegada",         label: "📍 Llegada",                   color: "#10b981" },
  { key: "montaje",         label: "🔧 Montaje",                  color: B.sand },
  { key: "proveedor",       label: "🚚 Proveedor",                color: B.sky },
  { key: "zarpe",           label: "⛵ Zarpe",                     color: "#34d399" },
  { key: "actividad",       label: "🎉 Actividad",                color: B.success },
  { key: "servicio",        label: "🍽️ Servicio F&B",             color: "#f97316" },
  { key: "transp_terrestre",label: "🚐 Transportación Terrestre",  color: "#fb923c" },
  { key: "transp_acuatica", label: "⛵ Transportación Acuática",   color: "#38bdf8" },
  { key: "pausa",           label: "⏸ Pausa",                     color: "rgba(255,255,255,0.3)" },
  { key: "traslado",        label: "🚢 Traslado",                  color: "#a78bfa" },
  { key: "cierre",          label: "🔒 Cierre",                    color: B.warning },
  { key: "emergencia",      label: "🚨 Emergencia",                color: B.danger },
];
const MUELLE_OPCIONES = ["Muelle La Bodeguita", "Muelle Atolon Beach Club"];

// Sub-menú opciones para transportación
const MODALIDAD_SERVICIO = [
  { key: "incluida",     label: "Incluida",                   color: B.success },
  { key: "cliente",      label: "Servicio por el Cliente",    color: B.warning },
  { key: "tercerizado",  label: "Servicio Tercerizado",       color: B.sky },
];
const RECEPCION_OPCIONES = ["Muelle La Bodeguita", "Muelle Atolon Beach Club"];
const VEHICULOS_TERRESTRES = ["Van 15 pax", "Van 12 pax", "Bus 40 pax", "Bus 30 pax", "Camioneta", "Taxi", "Vehículo particular"];
const VEHICULOS_ACUATICOS  = ["Caribe I", "Coral II", "Atolon III", "Sunrise", "Palmera", "Lancha externa", "Yate externo", "Catamarán"];
const tipoColor = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.color || B.sky;
const tipoLabel = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.label || t;

const ESTADOS_TL = [
  { key: "pendiente",   label: "Pendiente",   color: "rgba(255,255,255,0.4)" },
  { key: "en_curso",    label: "En curso",    color: B.warning },
  { key: "completado",  label: "✓ Listo",     color: B.success },
  { key: "retrasado",   label: "⚠ Retrasado", color: B.danger },
  { key: "cancelado",   label: "✗ Cancelado", color: B.danger },
];

const RESTRICCIONES_BASE = ["Vegetariano","Vegano","Sin gluten","Sin lactosa","Sin mariscos","Sin nueces","Sin cerdo","Kosher","Halal","Diabético","Sin alcohol"];

// ─── Componentes menores ─────────────────────────────────────────────────────
function Pill({ label, color, onRemove }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
      {label}
      {onRemove && <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.6, fontSize: 13 }}>✕</span>}
    </span>
  );
}

function Inp({ value, onChange, type = "text", placeholder, style: sx, ...rest }) {
  return <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...IS, ...sx }} {...rest} />;
}

function Sel({ value, onChange, children }) {
  return <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...IS, appearance: "none" }}>{children}</select>;
}

function SectionCard({ title, children, action }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        {action}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

// ─── TIMELINE ────────────────────────────────────────────────────────────────
function TabTimeline({ items, onChange, readOnly, transportes = [], usuarios = [], serviciosAB = [], embarcacionesEvento = [], evento = {} }) {
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx]   = useState(null);
  const EMPTY = { fecha: "", hora: "", tipo: "actividad", titulo: "", descripcion: "", responsable: "", responsable_otro: "", duracion: 60, estado: "pendiente", proveedor: "", transporte_id: "", ubicacion: "", servicio_modalidad: "", servicio_contratado_id: "", servicios_ids: [], tareas: [],
    // Campos de transportación
    modalidad: "incluida", vehiculo: "", vehiculo_otro: "", embarcaciones_sel: [], origen: "", destino: "",
    pax_transp: "", recepcion: "", recepcion_otro: "", proveedor_transp: "", contacto_proveedor: "", costo: "",
    hora_llegada: "",
    // Campos de llegada
    muelle: "", muelle_otro: "" };
  const [form, setForm] = useState(EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const sorted = [...items].sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")));

  const openNew  = () => { setForm({ ...EMPTY, fecha: diaActivo !== "todos" ? diaActivo : "" }); setEditIdx(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY, ...item }); setEditIdx(item.id); setShowForm(true); };

  const save = () => {
    if (!form.hora || !form.titulo) return;
    const item = { ...form, id: form.id || uid() };
    if (editIdx) {
      onChange(items.map(x => x.id === editIdx ? item : x));
    } else {
      onChange([...items, item]);
    }
    setShowForm(false);
  };

  const remove = (id) => onChange(items.filter(x => x.id !== id));

  const setEstado = (id, estado) => onChange(items.map(x => x.id === id ? { ...x, estado } : x));

  // Task management per block
  const [taskBlockId, setTaskBlockId] = useState(null); // expanded tasks for which block
  const [newTask, setNewTask] = useState("");
  const [newTaskAsignado, setNewTaskAsignado] = useState("");
  const [newTaskOtro, setNewTaskOtro] = useState("");
  const addTask = (blockId) => {
    if (!newTask.trim()) return;
    const asignado = newTaskAsignado === "__otro" ? (newTaskOtro || "") : (newTaskAsignado || "");
    onChange(items.map(x => x.id === blockId ? { ...x, tareas: [...(x.tareas||[]), { id: uid(), texto: newTask.trim(), asignado, completada: false }] } : x));
    setNewTask(""); setNewTaskAsignado(""); setNewTaskOtro("");
  };
  const toggleTask = (blockId, taskId) => {
    onChange(items.map(x => x.id === blockId ? { ...x, tareas: (x.tareas||[]).map(t => t.id === taskId ? { ...t, completada: !t.completada } : t) } : x));
  };
  const removeTask = (blockId, taskId) => {
    onChange(items.map(x => x.id === blockId ? { ...x, tareas: (x.tareas||[]).filter(t => t.id !== taskId) } : x));
  };

  // Calcular hora fin
  const horaFin = (hora, dur) => {
    if (!hora || !dur) return "";
    const [h, m] = hora.split(":").map(Number);
    const tot = h * 60 + m + Number(dur);
    return String(Math.floor(tot / 60) % 24).padStart(2,"0") + ":" + String(tot % 60).padStart(2,"0");
  };

  // Detectar solapamientos
  const solapos = new Set();
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a.hora && a.duracion && horaFin(a.hora, a.duracion) > b.hora) {
      solapos.add(a.id); solapos.add(b.id);
    }
  }

  // Day tabs — extract unique dates
  const fechas = [...new Set(sorted.map(it => it.fecha).filter(Boolean))].sort();
  const multiDia = fechas.length > 1;
  const [diaActivo, setDiaActivo] = useState("todos");

  const filtrado = multiDia && diaActivo !== "todos"
    ? sorted.filter(it => it.fecha === diaActivo)
    : sorted;

  const now = nowHH();
  const currentIdx = filtrado.findIndex((it, i) => {
    const next = filtrado[i + 1];
    return it.hora <= now && (!next || next.hora > now);
  });

  // Generar PDF imprimible
  const downloadRundown = () => {
    const w = window.open("", "_blank");
    if (!w) return;

    const fmtFechaCab = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
    const tipoLabelHtml = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.label || t;
    const tipoColorHtml = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.color || "#8ECAE6";

    // Group by date
    const porFecha = {};
    sorted.forEach(b => {
      const f = b.fecha || "sin_fecha";
      if (!porFecha[f]) porFecha[f] = [];
      porFecha[f].push(b);
    });
    const fechasOrd = Object.keys(porFecha).sort();

    // Determine if block is client responsibility
    const isClientBlock = (b) => b.modalidad === "cliente" || b.servicio_modalidad === "cliente";

    const blockRow = (b) => {
      const c = tipoColorHtml(b.tipo);
      const label = tipoLabelHtml(b.tipo);
      const resp = b.responsable === "__otro" ? (b.responsable_otro || "") : (b.responsable || "");
      const embs = b.embarcaciones_sel?.length > 0 ? b.embarcaciones_sel.map(e => e.nombre || e).join(" + ") : "";
      const muelle = b.muelle === "otro" ? (b.muelle_otro || "") : (b.muelle || "");
      const esCliente = isClientBlock(b);
      const bgRow = esCliente ? "background:#fef9c3;" : "";
      const tareasHtml = (b.tareas || []).length > 0
        ? `<div style="margin-top:6px;padding-left:12px;font-size:11px;color:#555;">${(b.tareas||[]).map(t => `<div>${t.completada ? "☑" : "☐"} ${t.texto}${t.asignado ? ` <em>(${t.asignado})</em>` : ""}</div>`).join("")}</div>`
        : "";
      return `
        <tr style="border-bottom:1px solid #e5e7eb;page-break-inside:avoid;${bgRow}">
          <td style="padding:10px 12px;width:80px;vertical-align:top;font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;color:${c};white-space:nowrap;">
            ${b.hora || "—"}${b.duracion ? `<div style="font-size:10px;color:#999;font-weight:400;">${b.duracion}′</div>` : ""}
          </td>
          <td style="padding:10px 12px;vertical-align:top;border-left:3px solid ${c};">
            <div style="font-size:10px;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">
              ${label}${esCliente ? ` <span style="background:#ca8a04;color:#fff;padding:1px 6px;border-radius:4px;font-size:9px;margin-left:4px;">⚠ RESPONSABILIDAD DEL CLIENTE</span>` : ""}
            </div>
            <div style="font-size:14px;font-weight:700;color:#111;">${b.titulo || ""}</div>
            ${b.descripcion ? `<div style="font-size:12px;color:#555;margin-top:3px;">${b.descripcion}</div>` : ""}
            <div style="font-size:11px;color:#666;margin-top:4px;">
              ${resp ? `👤 ${resp} &nbsp;` : ""}
              ${b.proveedor ? `🏢 ${b.proveedor} &nbsp;` : ""}
              ${b.ubicacion ? `📍 ${b.ubicacion} &nbsp;` : ""}
              ${embs ? `⛵ ${embs} &nbsp;` : ""}
              ${muelle ? `📍 ${muelle} &nbsp;` : ""}
              ${b.pax_transp ? `👥 ${b.pax_transp} pax &nbsp;` : ""}
              ${b.origen ? `${b.origen}${b.destino ? ` → ${b.destino}` : ""} &nbsp;` : ""}
            </div>
            ${tareasHtml}
          </td>
        </tr>
      `;
    };

    // Collect all client responsibilities
    const clientBlocks = sorted.filter(isClientBlock);
    const clientResponsibilitiesHTML = clientBlocks.length > 0 ? `
      <div style="margin-top:24px;padding:18px 22px;background:#fef9c3;border:2px solid #ca8a04;border-radius:10px;page-break-inside:avoid;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;color:#854d0e;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.02em;">
          ⚠ Responsabilidades del Cliente
        </div>
        <div style="font-size:11px;color:#713f12;margin-bottom:12px;font-style:italic;">
          Las siguientes actividades/servicios son coordinadas y ejecutadas directamente por el cliente. Atolon Beach Club no asume responsabilidad sobre estas.
        </div>
        <ol style="margin:0;padding-left:20px;color:#713f12;font-size:12px;line-height:1.8;">
          ${clientBlocks.map(b => {
            const fechaTxt = b.fecha ? new Date(b.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) + " · " : "";
            const embs = b.embarcaciones_sel?.length > 0 ? b.embarcaciones_sel.map(e => e.nombre || e).join(" + ") : (b.vehiculo || "");
            return `<li><strong>${fechaTxt}${b.hora || ""}</strong> — ${tipoLabelHtml(b.tipo)}: ${b.titulo || ""}${b.proveedor ? ` (Proveedor: ${b.proveedor})` : ""}${embs ? ` — ${embs}` : ""}${b.descripcion ? `<br><em>${b.descripcion}</em>` : ""}</li>`;
          }).join("")}
        </ol>
      </div>
    ` : "";

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Rundown — ${evento.nombre || "Evento"}</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; color: #111; max-width: 800px; margin: 0 auto; padding: 32px; background: #fff; }
    h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 32px; margin: 0 0 4px; letter-spacing: 0.02em; }
    .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
    h2 { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; margin: 24px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #0D1B3E; color: #0D1B3E; }
    table { width: 100%; border-collapse: collapse; }
    .firma { margin-top: 60px; display: flex; gap: 60px; }
    .firma > div { flex: 1; }
    .firma .linea { border-bottom: 1px solid #999; height: 40px; margin-bottom: 6px; }
    .firma .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print {
      body { padding: 16px; }
      h2 { page-break-after: avoid; }
      tr { page-break-inside: avoid; }
      .no-print { display: none; }
    }
    .actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
    .actions button { padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; }
    .btn-print { background: #0D1B3E; color: #fff; }
    .btn-close { background: #e5e7eb; color: #111; }
  </style>
</head>
<body>
  <div class="actions no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>

  <h1>📋 Rundown — ${evento.nombre || "Evento"}</h1>
  <div class="meta">
    ${evento.tipo ? `${evento.tipo} · ` : ""}${evento.fecha ? fmtFechaCab(evento.fecha) : ""}${evento.fecha_fin && evento.fecha_fin !== evento.fecha ? ` → ${fmtFechaCab(evento.fecha_fin)}` : ""}
    ${evento.contacto ? `<br>Cliente: <strong>${evento.contacto}</strong>` : ""}
    ${evento.pax ? ` · ${evento.pax} pax` : ""}
  </div>

  ${fechasOrd.map(f => {
    const titulo = f === "sin_fecha" ? "Sin fecha asignada" : fmtFechaCab(f);
    return `
      <h2>${titulo}</h2>
      <table>
        ${porFecha[f].map(blockRow).join("")}
      </table>
    `;
  }).join("")}

  ${clientResponsibilitiesHTML}

  <div class="firma">
    <div>
      <div class="linea"></div>
      <div class="label">Firma del cliente</div>
    </div>
    <div>
      <div class="linea"></div>
      <div class="label">Fecha de aprobación</div>
    </div>
  </div>

  <div class="footer">
    Atolon Beach Club · Cartagena de Indias · Generado el ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
  </div>
</body>
</html>
    `;

    w.document.write(html);
    w.document.close();
  };

  // ── Generar BEO (Banquet Event Order) ────────────────────────────────────────
  const downloadBEO = async () => {
    const w = window.open("", "_blank");
    if (!w) return;

    // Load banquete menu items to match services by name and pull their opciones
    let menuBanquetes = [];
    if (supabase) {
      const { data } = await supabase.from("menu_items")
        .select("id, nombre, opciones")
        .eq("menu_tipo", "banquetes").eq("activo", true);
      menuBanquetes = data || [];
    }
    const findMI = (nombre) => {
      const d = (nombre || "").toLowerCase().trim();
      if (!d) return null;
      return menuBanquetes.find(m => {
        const mn = (m.nombre || "").toLowerCase().trim();
        return mn === d || d.includes(mn) || mn.includes(d);
      });
    };

    const fmtFechaCab = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase() : "—";

    // Build sections from rundown blocks + event data
    const blocks = (items || []);
    const dietas = (evento.restricciones_dieteticas || []);

    // Compute start/end (fecha + hora) from rundown blocks, sorted chronologically
    const bloquesOrd = [...blocks]
      .filter(b => b.hora && /^\d{1,2}:\d{2}/.test(b.hora))
      .sort((a, b) => ((a.fecha || "") + (a.hora || "")).localeCompare((b.fecha || "") + (b.hora || "")));
    const fmtFechaCorta = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "";
    const horaInicioBEO = (() => {
      const first = bloquesOrd[0];
      if (first) {
        const fStr = fmtFechaCorta(first.fecha || evento.fecha);
        return `${fStr ? fStr + " · " : ""}${first.hora}`;
      }
      return `${evento.fecha ? fmtFechaCorta(evento.fecha) + " · " : ""}${evento.hora_ini || "—"}`;
    })();
    const horaFinBEO = (() => {
      if (bloquesOrd.length === 0) return `${evento.fecha_fin ? fmtFechaCorta(evento.fecha_fin) + " · " : (evento.fecha ? fmtFechaCorta(evento.fecha) + " · " : "")}${evento.hora_fin || "—"}`;
      const last = bloquesOrd[bloquesOrd.length - 1];
      let lastFecha = last.fecha || evento.fecha_fin || evento.fecha || "";
      let lastHora = last.hora;
      if (last.duracion_min) {
        const [hh, mm] = (last.hora || "0:0").split(":").map(Number);
        const total = hh * 60 + mm + Number(last.duracion_min);
        const dayShift = Math.floor(total / (60 * 24));
        const h = Math.floor(total / 60) % 24, m = total % 60;
        lastHora = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        if (dayShift > 0 && lastFecha) {
          const d = new Date(lastFecha + "T12:00:00");
          d.setDate(d.getDate() + dayShift);
          lastFecha = d.toISOString().slice(0, 10);
        }
      }
      return `${lastFecha ? fmtFechaCorta(lastFecha) + " · " : ""}${lastHora}`;
    })();

    // ── Helper: agrupar bloques por fecha ──
    const fmtDateHead = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() : "SIN FECHA";
    const groupByFecha = (arr) => {
      const map = {};
      arr.forEach(b => {
        const key = b.fecha || "zzz";
        if (!map[key]) map[key] = [];
        map[key].push(b);
      });
      return Object.keys(map).sort().map(k => ({ fecha: k === "zzz" ? "" : k, items: map[k].sort((a, b) => (a.hora || "").localeCompare(b.hora || "")) }));
    };
    const seccionFecha = (grupos, renderItem) => grupos.map(g => `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;font-weight:800;color:#0D1B3E;background:#e5e7eb;padding:3px 8px;border-radius:4px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">${fmtDateHead(g.fecha)}</div>
        <ol style="margin:0;padding-left:18px;font-size:11px;line-height:1.6;">${g.items.map(renderItem).join("")}</ol>
      </div>
    `).join("");

    // Transportación: bloques de transp + embarcaciones del evento
    const transpBlocks = blocks.filter(b => b.tipo === "transp_terrestre" || b.tipo === "transp_acuatica" || b.tipo === "llegada");
    const transpGrupos = groupByFecha(transpBlocks);
    const transpRender = (b) => {
      const muelle = b.muelle === "otro" ? (b.muelle_otro || "") : (b.muelle || "");
      const embs = b.embarcaciones_sel?.length > 0 ? b.embarcaciones_sel.map(e => e.nombre || e).join(" + ") : (b.vehiculo === "otro" ? (b.vehiculo_otro || "") : (b.vehiculo || ""));
      if (b.tipo === "llegada") return `<li>${b.hora ? `<strong>${b.hora}</strong> — ` : ""}Punto de recepción: <strong>${muelle}</strong>${b.pax_transp ? ` — ${b.pax_transp} pax` : ""}</li>`;
      return `<li>${b.hora ? `<strong>${b.hora}</strong> — ` : ""}${b.titulo || (b.tipo === "transp_acuatica" ? "Transporte acuático" : "Transporte terrestre")}: ${embs}${b.pax_transp ? ` — ${b.pax_transp} pax` : ""}${b.origen ? ` — ${b.origen}${b.destino ? ` → ${b.destino}` : ""}` : ""}</li>`;
    };
    const transpHTML = (transpBlocks.length > 0 || (embarcacionesEvento || []).length > 0) ? `
      ${(embarcacionesEvento || []).length > 0 ? `<div style="font-size:11px;margin-bottom:6px;">Embarcaciones contratadas: <strong>${embarcacionesEvento.map(e => `${e.nombre} (Cap. ${e.capacidad})`).join(", ")}</strong></div>` : ""}
      ${seccionFecha(transpGrupos, transpRender)}
    ` : "<em style='font-size:11px;color:#999;'>—</em>";

    // F&B Servicio: bloques tipo servicio
    const servBlocks = blocks.filter(b => b.tipo === "servicio");
    const servGrupos = groupByFecha(servBlocks);
    const servRender = (b) => {
      let txt = `${b.hora ? `<strong>${b.hora}</strong> — ` : ""}${b.titulo || ""}`;
      if (b.ubicacion) txt += ` — 📍 ${b.ubicacion}`;
      if (b.servicio_modalidad) {
        const m = { interno: "Interno", externo: "Proveedor Externo", cliente: "Coordinado por Cliente" }[b.servicio_modalidad];
        if (m) txt += ` — ${m}`;
      }
      return `<li>${txt}</li>`;
    };
    const aybServicioHTML = servBlocks.length > 0 ? seccionFecha(servGrupos, servRender) : "<em style='font-size:11px;color:#999;'>—</em>";

    // Cocina: menú seleccionado + dietas
    const menusItems = [];
    if (evento.menus_detalle) {
      Object.values(evento.menus_detalle).forEach(m => (m.platos || []).forEach(p => menusItems.push(p)));
    }
    const cocinaHTML = `
      <ol style="margin:0;padding-left:18px;font-size:11px;line-height:1.6;">
        <li>Selección de menú: ${menusItems.length > 0 ? `<strong>${menusItems.length} platos seleccionados</strong>` : "ENVIADO"}</li>
        ${dietas.length > 0 ? `<li>Restricciones alimentarias: <strong>${dietas.length} casos</strong> (${dietas.map(d => d.nombre || "").filter(Boolean).join(", ")})</li>` : ""}
      </ol>
    `;

    // A&B Cocina: solo dietas/alergias
    const aybCocinaHTML = dietas.length > 0 ? `
      Se envía <strong>restricciones alimentarias y alergias</strong>, así:<br>
      <ul style="margin:6px 0;padding-left:18px;font-size:11px;line-height:1.6;">
        ${dietas.map(d => {
          const alergias = (d.alergias || []).join(", ");
          const restr = (d.restricciones || []).join(", ");
          return `<li><strong>${d.nombre || "—"}</strong>${alergias ? ` — Alergias: ${alergias}` : ""}${restr ? ` — Restricciones: ${restr}` : ""}${d.menu_especial ? ` — Menú: ${d.menu_especial}` : ""}</li>`;
        }).join("")}
      </ul>
    ` : "Se envía <strong>restricciones alimentarias y alergias</strong>, así: No reportan.";

    // Equipo prevencion: tareas relacionadas
    const prevTasks = blocks.flatMap(b => (b.tareas || [])).filter(t => /embarc|desembarc|prevenci|seguridad/i.test(t.texto || ""));
    const prevHTML = prevTasks.length > 0
      ? `<ul style="margin:0;padding-left:18px;font-size:11px;line-height:1.6;">${prevTasks.map(t => `<li>${t.texto}</li>`).join("")}</ul>`
      : "<em style='font-size:11px;color:#999;'>—</em>";

    // Happenings: actividades especiales
    const actBlocks = blocks.filter(b => b.tipo === "actividad");
    const actGrupos = groupByFecha(actBlocks);
    const actRender = (b) => `<li>${b.hora ? `<strong>${b.hora}</strong> — ` : ""}${b.titulo || ""}${b.ubicacion ? ` — 📍 ${b.ubicacion}` : ""}${b.proveedor ? ` — ${b.proveedor}` : ""}</li>`;
    const happeningsHTML = actBlocks.length > 0 ? seccionFecha(actGrupos, actRender) : "<em style='font-size:11px;color:#999;'>—</em>";

    // Equipo ventas: vendedor, responsable, notas
    const ventasHTML = `
      ${evento.vendedor ? `<div>Acompañamiento del grupo: <strong>${evento.vendedor}</strong></div>` : ""}
      ${evento.responsable_evento ? `<div>Responsable del evento: <strong>${evento.responsable_evento}</strong></div>` : ""}
      ${evento.notas ? `<div style='margin-top:6px;color:#555;'>${evento.notas}</div>` : ""}
    `;

    // Hotel/hospedaje
    const hospedajeItems = (evento.cotizacion_data?.hospedaje || []);
    const hospedajeHTML = hospedajeItems.length > 0
      ? `<ul style="margin:0;padding-left:18px;font-size:11px;line-height:1.6;">${hospedajeItems.map(h => `<li>${h.concepto}${h.cantidad > 1 ? ` × ${h.cantidad}` : ""}${h.noches > 1 ? ` × ${h.noches}n` : ""}</li>`).join("")}</ul>`
      : "NO tienen habitaciones contratadas";

    // Comentarios adicionales
    const comentariosHTML = evento.notas_operativas
      ? `<div style="font-size:11px;line-height:1.6;">${evento.notas_operativas}</div>`
      : "<em style='font-size:11px;color:#999;'>—</em>";

    // Contabilidad
    const contabilidadHTML = `
      <strong>Datos para facturación:</strong><br>
      <div style="font-size:11px;line-height:1.6;margin-top:4px;">
        ${evento.empresa ? `Nombre/Empresa: ${evento.empresa}<br>` : ""}
        ${evento.nit ? `NIT/Pasaporte: ${evento.nit}<br>` : ""}
        ${evento.contacto && !evento.empresa ? `Nombre: ${evento.contacto}<br>` : ""}
        ${evento.email ? `Correo: ${evento.email}<br>` : ""}
        ${evento.tel ? `Teléfono: ${evento.tel}<br>` : ""}
        ${evento.direccion ? `Dirección: ${evento.direccion}<br>` : ""}
      </div>
    `;

    // Pax + staff
    const paxStaff = (() => {
      const staff = (evento.pasadias_org || []).filter(p => p.tipo === "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0);
      const pax = (evento.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0) || evento.pax || 0;
      return staff > 0 ? `${pax} + ${staff} STAFF` : `${pax}`;
    })();

    // ── PÁGINA: Minuto a minuto (Rundown) ──
    const bloquesPorFecha = groupByFecha(blocks);
    const tipoLabel2 = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.label || t;
    const tipoColor2 = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.color || "#8ECAE6";
    const renderRundownRow = (b) => {
      const c = tipoColor2(b.tipo);
      const esCliente = b.modalidad === "cliente" || b.servicio_modalidad === "cliente";
      const bg = esCliente ? "background:#fef9c3;" : "";
      const resp = b.responsable === "__otro" ? (b.responsable_otro || "") : (b.responsable || "");
      const embs = b.embarcaciones_sel?.length > 0 ? b.embarcaciones_sel.map(e => e.nombre || e).join(" + ") : "";
      const muelle = b.muelle === "otro" ? (b.muelle_otro || "") : (b.muelle || "");
      return `
        <tr style="border-bottom:1px solid #e5e7eb;page-break-inside:avoid;${bg}">
          <td style="padding:8px 10px;width:70px;vertical-align:top;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;color:${c};white-space:nowrap;">
            ${b.hora || "—"}${b.duracion ? `<div style="font-size:9px;color:#999;font-weight:400;">${b.duracion}′</div>` : ""}
          </td>
          <td style="padding:8px 10px;vertical-align:top;border-left:3px solid ${c};">
            <div style="font-size:9px;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">${tipoLabel2(b.tipo)}${esCliente ? ' <span style="background:#ca8a04;color:#fff;padding:1px 5px;border-radius:3px;font-size:8px;margin-left:3px;">⚠ CLIENTE</span>' : ""}</div>
            <div style="font-size:12px;font-weight:700;color:#111;">${b.titulo || ""}</div>
            ${b.descripcion ? `<div style="font-size:10px;color:#555;margin-top:2px;">${b.descripcion}</div>` : ""}
            <div style="font-size:10px;color:#666;margin-top:3px;">
              ${resp ? `👤 ${resp} &nbsp;` : ""}${b.proveedor ? `🏢 ${b.proveedor} &nbsp;` : ""}${b.ubicacion ? `📍 ${b.ubicacion} &nbsp;` : ""}${embs ? `⛵ ${embs} &nbsp;` : ""}${muelle ? `📍 ${muelle} &nbsp;` : ""}${b.pax_transp ? `👥 ${b.pax_transp} pax &nbsp;` : ""}${b.origen ? `${b.origen}${b.destino ? ` → ${b.destino}` : ""} &nbsp;` : ""}
            </div>
          </td>
        </tr>
      `;
    };
    const rundownPageHTML = blocks.length > 0 ? `
      <div style="page-break-before:always;margin-top:24px;">
        <h1 style="font-size:18px;text-align:center;margin:0 0 4px;font-weight:800;">ATOLON BEACH CLUB</h1>
        <div style="text-align:center;font-size:11px;color:#666;margin-bottom:16px;">MINUTO A MINUTO</div>
        <div style="font-size:12px;text-align:center;margin-bottom:16px;"><strong>${evento.nombre || ""}</strong> — ${paxStaff} pax</div>
        ${bloquesPorFecha.map(g => `
          <div style="margin-bottom:18px;">
            <div style="font-size:12px;font-weight:800;color:#fff;background:#0D1B3E;padding:5px 10px;border-radius:4px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">${fmtDateHead(g.fecha)}</div>
            <table style="width:100%;border-collapse:collapse;">${g.items.map(renderRundownRow).join("")}</table>
          </div>
        `).join("")}
      </div>
    ` : "";

    // ── SEGUNDA PÁGINA: Menú de A&B por servicio (agrupado por fecha) ──
    const menusDetalleObj = evento.menus_detalle || {};
    // Build list of A&B services with plates (rundown blocks have priority, then unlinked contracted services)
    const serviciosConPlatos = [];
    const contractedUsed = new Set();
    const addOpcionesFromCatalog = (titulo, platos, seen) => {
      const mi = findMI(titulo);
      if (mi && Array.isArray(mi.opciones)) {
        mi.opciones.forEach((op, i) => {
          const nombre = typeof op === "string" ? op : (op?.nombre || "");
          if (!nombre || seen.has(nombre)) return;
          seen.add(nombre);
          platos.push({ id: `opcion-${mi.id}-${i}`, nombre, _fromOpcion: true });
        });
      }
    };
    // From rundown "servicio" blocks — include platos from linked contracted services too
    blocks.filter(b => b.tipo === "servicio").forEach(b => {
      const linkedKeys = [...(b.servicios_ids || []), b.servicio_contratado_id].filter(Boolean);
      linkedKeys.forEach(k => contractedUsed.add(k));
      const keys = [`rb-${b.id}`, ...linkedKeys];
      const seen = new Set();
      const platos = [];
      keys.forEach(k => {
        (menusDetalleObj[k]?.platos || []).forEach(p => {
          const pid = p.id || p.nombre;
          if (!seen.has(pid)) { seen.add(pid); platos.push(p); }
        });
      });
      addOpcionesFromCatalog(b.titulo || "", platos, seen);
      serviciosConPlatos.push({
        titulo: b.titulo || "Servicio",
        fecha: b.fecha || "",
        hora: b.hora || "",
        ubicacion: b.ubicacion || "",
        notas: b.descripcion || "",
        platos,
      });
    });
    // From servicios_contratados A&B (only those NOT already linked to a rundown block)
    const CATS_AB2 = ["Menú Restaurante", "Menú Bebidas", "Menú Banquetes"];
    (evento.servicios_contratados || []).filter(s => CATS_AB2.includes(s.categoria) && !contractedUsed.has(s.id)).forEach(s => {
      const seen = new Set();
      const platos = [];
      (menusDetalleObj[s.id]?.platos || []).forEach(p => {
        const pid = p.id || p.nombre;
        if (!seen.has(pid)) { seen.add(pid); platos.push(p); }
      });
      addOpcionesFromCatalog(s.descripcion || s.categoria, platos, seen);
      if (platos.length > 0 || s.fecha || s.hora) {
        serviciosConPlatos.push({
          titulo: s.descripcion || s.categoria,
          fecha: s.fecha || "",
          hora: s.hora || "",
          ubicacion: "",
          notas: s.notas || "",
          platos,
        });
      }
    });
    // Group services by fecha
    const servGruposMenu = groupByFecha(serviciosConPlatos);
    const menuPageHTML = serviciosConPlatos.length > 0 ? `
      <div style="page-break-before:always;margin-top:24px;">
        <h1 style="font-size:18px;text-align:center;margin:0 0 4px;font-weight:800;">ATOLON BEACH CLUB</h1>
        <div style="text-align:center;font-size:11px;color:#666;margin-bottom:16px;">MENÚ DE ALIMENTOS Y BEBIDAS</div>
        <div style="font-size:12px;text-align:center;margin-bottom:16px;">
          <strong>${evento.nombre || ""}</strong> — ${paxStaff} pax
        </div>
        ${servGruposMenu.map(g => `
          <div style="margin-bottom:20px;">
            <div style="font-size:13px;font-weight:800;color:#fff;background:#0D1B3E;padding:6px 12px;border-radius:4px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">
              ${fmtDateHead(g.fecha)}
            </div>
            ${g.items.map(s => `
              <div style="border:1px solid #d1d5db;border-radius:6px;padding:10px 14px;margin-bottom:8px;page-break-inside:avoid;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
                  <div style="font-size:13px;font-weight:800;color:#0D1B3E;">${s.titulo}</div>
                  <div style="font-size:11px;color:#666;">${s.hora || ""}${s.ubicacion ? ` · 📍 ${s.ubicacion}` : ""}</div>
                </div>
                ${s.notas ? `<div style="font-size:10px;color:#888;font-style:italic;margin-bottom:6px;">${s.notas.replace(/</g,"&lt;")}</div>` : ""}
                ${s.platos.length > 0 ? `
                  <ul style="margin:4px 0 0;padding-left:18px;font-size:11px;line-height:1.6;">
                    ${s.platos.map(p => `<li>${p.nombre || ""}${p.cantidad && p.cantidad > 1 ? ` × ${p.cantidad}` : ""}${p.notas ? ` — <em>${p.notas}</em>` : ""}</li>`).join("")}
                  </ul>
                ` : `<div style="font-size:10px;color:#bbb;font-style:italic;">— Sin platos seleccionados —</div>`}
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    ` : "";

    const beoNotas = evento.beo_notas || {};
    const notaBlock = (key) => beoNotas[key] ? `<div style="margin-top:8px;padding:6px 8px;background:#fff8e1;border-left:3px solid #f59e0b;font-size:11px;line-height:1.5;white-space:pre-wrap;">${beoNotas[key].replace(/</g,"&lt;")}</div>` : "";

    const mantenimientoHTML = `<em style='font-size:11px;color:#999;'>—</em>`;
    const areasHTML = `<em style='font-size:11px;color:#999;'>—</em>`;
    const jardineriaHTML = `<em style='font-size:11px;color:#999;'>—</em>`;

    // A&B Bares: bebidas (solo si hay items de cotización/servicios reales)
    const bebidasItems = (evento.cotizacion_data?.alimentos || []).filter(a => /bebida|alcohol|vino|cerveza|cocktail|aguardient|ron|whisky|vodka|gin|tequila|mezcal/i.test(a.concepto || ""));
    const baresHTML = bebidasItems.length > 0 ? `
      <ol style="margin:0;padding-left:18px;font-size:11px;line-height:1.6;">
        <li>Ofrecer a los invitados:<br>${bebidasItems.map(b => `&nbsp;&nbsp;- ${b.concepto}${b.cantidad > 1 ? ` × ${b.cantidad}` : ""}`).join("<br>")}</li>
      </ol>
    ` : "<em style='font-size:11px;color:#999;'>—</em>";

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>BEO — ${evento.nombre || "Evento"}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; max-width: 900px; margin: 0 auto; padding: 24px; background: #fff; font-size: 12px; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 4px; font-weight: 800; }
    .subtitle { text-align: center; font-size: 11px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    table.head td { border: 1px solid #333; padding: 6px 10px; font-size: 11px; }
    table.head td.label { background: #f3f4f6; font-weight: 700; width: 22%; }
    table.body td { border: 1px solid #333; padding: 8px 10px; vertical-align: top; }
    table.body th { border: 1px solid #333; background: #d1d5db; padding: 8px; font-size: 11px; font-weight: 800; text-align: center; }
    .col { width: 50%; }
    .actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
    .actions button { padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; }
    .btn-print { background: #0D1B3E; color: #fff; }
    .btn-close { background: #e5e7eb; color: #111; }
    @media print { .no-print { display: none; } body { padding: 12px; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="actions no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>

  <h1>ATOLON BEACH CLUB</h1>
  <div class="subtitle">ORDEN DE SERVICIO</div>

  <table class="head">
    <tr><td class="label">Nombre del grupo:</td><td>${evento.nombre || "—"}</td><td class="label">Locación:</td><td>CLUB DE PLAYA</td></tr>
    <tr><td class="label">Nombre del evento:</td><td>${evento.nombre || "—"}</td><td class="label">Nacionalidad:</td><td>${evento.nacionalidad || "—"}</td></tr>
    <tr><td class="label">Fecha del evento:</td><td>${fmtFechaCab(evento.fecha)}</td><td class="label">Número de Pax:</td><td>${paxStaff}</td></tr>
    <tr><td class="label">Nombre del solicitante:</td><td>${evento.contacto || evento.empresa || "—"}</td><td class="label">Hora de Inicio:</td><td>${horaInicioBEO}</td></tr>
    <tr><td class="label">Departamento:</td><td>${evento.tipo || ""}</td><td class="label">Hora de término:</td><td>${horaFinBEO}</td></tr>
    <tr><td class="label">Emitió:</td><td>${evento.vendedor || evento.responsable_evento || "—"}</td><td class="label">Folio | Verificación:</td><td>${evento.id || ""}</td></tr>
  </table>

  <table class="body" style="margin-top:0;border-top:none;">
    <tr>
      <th>EQUIPO VENTAS-GRUPOS</th>
      <th>COCINA</th>
    </tr>
    <tr>
      <td class="col">${ventasHTML || "<em style='color:#999;'>—</em>"}${notaBlock("ventas")}</td>
      <td class="col">${cocinaHTML}${notaBlock("cocina")}</td>
    </tr>
    <tr>
      <th>ÁREAS PÚBLICAS — BAÑOS</th>
      <th>HOTEL — HOSPEDAJE</th>
    </tr>
    <tr>
      <td>${areasHTML}${notaBlock("areas")}</td>
      <td>${hospedajeHTML}${notaBlock("hospedaje")}</td>
    </tr>
    <tr>
      <th>TRANSPORTACIÓN</th>
      <th>A & B + SERVICIO</th>
    </tr>
    <tr>
      <td>${transpHTML}${notaBlock("transp")}</td>
      <td>${aybServicioHTML}${notaBlock("ayb_servicio")}</td>
    </tr>
    <tr>
      <th>MANTENIMIENTO</th>
      <th>A & B ::COCINA::</th>
    </tr>
    <tr>
      <td>${mantenimientoHTML}${notaBlock("mantenimiento")}</td>
      <td>${aybCocinaHTML}${notaBlock("ayb_cocina")}</td>
    </tr>
    <tr>
      <th>JARDINERÍA — PLAYA — PISCINA</th>
      <th>A & B ::BARES::</th>
    </tr>
    <tr>
      <td>${jardineriaHTML}${notaBlock("jardineria")}</td>
      <td>${baresHTML}${notaBlock("bares")}</td>
    </tr>
    <tr>
      <th>EQUIPO PREVENCIÓN</th>
      <th>HAPPENINGS</th>
    </tr>
    <tr>
      <td>${prevHTML}${notaBlock("prevencion")}</td>
      <td>${happeningsHTML}${notaBlock("happenings")}</td>
    </tr>
    <tr>
      <th>COMENTARIOS Y/O ADICIONALES</th>
      <th>CONTABILIDAD</th>
    </tr>
    <tr>
      <td>${comentariosHTML}${notaBlock("comentarios")}</td>
      <td>${contabilidadHTML}${notaBlock("contabilidad")}</td>
    </tr>
  </table>

  ${rundownPageHTML}

  ${menuPageHTML}

  <div style="margin-top:24px;text-align:center;font-size:9px;color:#999;">
    Generado el ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })} · Atolon Beach Club · Cartagena de Indias
  </div>
</body>
</html>
    `;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadRundown} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}`, color: B.sky }}>📄 Descargar Rundown</button>
            <button onClick={downloadBEO} style={{ ...BTN(B.navyLight), border: `1px solid ${B.sand}`, color: B.sand }}>📋 Descargar BEO</button>
          </div>
          <button onClick={openNew} style={BTN(B.success)}>+ Agregar bloque</button>
        </div>
      )}

      {/* Day tabs */}
      {multiDia && (
        <div style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto", borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 0 }}>
          <button onClick={() => setDiaActivo("todos")}
            style={{ padding: "7px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12,
              fontWeight: diaActivo === "todos" ? 700 : 400, whiteSpace: "nowrap",
              background: "none", color: diaActivo === "todos" ? B.white : "rgba(255,255,255,0.35)",
              borderBottom: diaActivo === "todos" ? `2px solid ${B.sky}` : "2px solid transparent" }}>
            Todos ({sorted.length})
          </button>
          {fechas.map(f => {
            const label = new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
            const count = sorted.filter(it => it.fecha === f).length;
            return (
              <button key={f} onClick={() => setDiaActivo(f)}
                style={{ padding: "7px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12,
                  fontWeight: diaActivo === f ? 700 : 400, whiteSpace: "nowrap",
                  background: "none", color: diaActivo === f ? B.white : "rgba(255,255,255,0.35)",
                  borderBottom: diaActivo === f ? `2px solid ${B.sky}` : "2px solid transparent" }}>
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Línea de tiempo */}
      <div style={{ position: "relative" }}>
        {/* Barra vertical */}
        <div style={{ position: "absolute", left: 66, top: 0, bottom: 0, width: 2, background: B.navyLight, zIndex: 0 }} />

        {filtrado.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            {multiDia ? "Sin bloques para este día." : "No hay bloques en el rundown. Agrega el primer bloque."}
          </div>
        )}

        {filtrado.map((item, i) => {
          const color  = tipoColor(item.tipo);
          const esCurr = i === currentIdx;
          const solapo = solapos.has(item.id);
          return (
            <div key={item.id} style={{ display: "flex", gap: 0, marginBottom: 6, position: "relative", zIndex: 1 }}>
              {/* Fecha + Hora */}
              <div style={{ width: 64, textAlign: "right", paddingRight: 8, paddingTop: 12, flexShrink: 0 }}>
                {item.fecha && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{new Date(item.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</div>}
                <div style={{ fontSize: 13, fontWeight: 800, color: esCurr ? B.warning : "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>{item.hora}</div>
                {item.duracion && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{item.duracion}′</div>}
              </div>

              {/* Dot */}
              <div style={{ width: 14, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, boxShadow: esCurr ? `0 0 12px ${color}` : "none", border: esCurr ? `2px solid #fff` : "none", zIndex: 2 }} />
              </div>

              {/* Card */}
              <div style={{ flex: 1, marginLeft: 12, background: esCurr ? B.navyLight : B.navy,
                border: `1px solid ${solapo ? B.danger + "66" : esCurr ? color + "88" : B.navyLight}`,
                borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 14px",
                boxShadow: esCurr ? `0 0 20px ${color}22` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{tipoLabel(item.tipo)}</span>
                      {item.duracion && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>hasta {horaFin(item.hora, item.duracion)}</span>}
                      {solapo && <span style={{ fontSize: 10, color: B.danger }}>⚠ Solapamiento</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: item.descripcion ? 4 : 0 }}>{item.titulo}</div>
                    {item.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{item.descripcion}</div>}
                    {/* Extra info for Servicio F&B / Actividad */}
                    {item.tipo === "servicio" && (() => {
                      const ids = item.servicios_ids?.length > 0 ? item.servicios_ids : (item.servicio_contratado_id ? [item.servicio_contratado_id] : []);
                      if (ids.length === 0) return null;
                      const matched = ids.map(id => serviciosAB.find(s => s.id === id)).filter(Boolean);
                      if (matched.length === 0) return null;
                      return (
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", fontSize: 11 }}>
                          {matched.map(sc => (
                            <span key={sc.id} style={{ padding: "1px 8px", borderRadius: 4, background: "#f97316" + "22", color: "#f97316", fontWeight: 700, fontSize: 10 }}>
                              📋 {sc.descripcion || sc.categoria}{sc.cantidad > 1 ? ` · ${sc.cantidad} pax` : ""}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                    {(item.ubicacion || item.servicio_modalidad) && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        {item.servicio_modalidad && (() => {
                          const m = { interno: { label: "Interno", color: B.success }, externo: { label: "Proveedor Externo", color: B.sky }, cliente: { label: "Coord. Cliente", color: B.warning } }[item.servicio_modalidad];
                          return m ? <span style={{ padding: "1px 8px", borderRadius: 4, background: m.color + "22", color: m.color, fontWeight: 700, fontSize: 10 }}>{m.label}</span> : null;
                        })()}
                        {item.ubicacion && <span>📍 {item.ubicacion}</span>}
                      </div>
                    )}
                    {/* Extra info for traslado (linked transport) */}
                    {item.tipo === "traslado" && item.transporte_id && (() => {
                      const tr = transportes.find(t => t.id === item.transporte_id);
                      if (!tr) return null;
                      const tLabel = { ida: "⛵ Zarpe", vuelta: "🔄 Regreso", transfer: "🚌 Transfer", privado: "🚤 Privado", proveedor: "🚚 Proveedor" }[tr.tipo] || tr.tipo;
                      return (
                        <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                          <span style={{ padding: "1px 8px", borderRadius: 4, background: "#a78bfa22", color: "#a78bfa", fontWeight: 700, fontSize: 10 }}>{tLabel}</span>
                          <span>{tr.embarcacion}</span>
                          {tr.pax && <span>👥 {tr.pax}</span>}
                          {tr.muelle && <span>📍 {tr.muelle}</span>}
                        </div>
                      );
                    })()}
                    {/* Extra info for llegada */}
                    {item.tipo === "llegada" && item.muelle && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        <span style={{ padding: "1px 8px", borderRadius: 4, background: "#10b981" + "22", color: "#10b981", fontWeight: 700, fontSize: 10 }}>📍 {item.muelle === "otro" ? item.muelle_otro : item.muelle}</span>
                        {item.pax_transp && <span>👥 {item.pax_transp}</span>}
                      </div>
                    )}
                    {/* Extra info for transport types */}
                    {(item.tipo === "transp_terrestre" || item.tipo === "transp_acuatica") && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        {item.modalidad && <span style={{ padding: "1px 6px", borderRadius: 4, background: (MODALIDAD_SERVICIO.find(m=>m.key===item.modalidad)?.color||"#888") + "22", color: MODALIDAD_SERVICIO.find(m=>m.key===item.modalidad)?.color, fontWeight: 700, fontSize: 10 }}>{MODALIDAD_SERVICIO.find(m=>m.key===item.modalidad)?.label}</span>}
                        {item.embarcaciones_sel?.length > 0
                          ? item.embarcaciones_sel.map(e => <span key={e.nombre || e}>{e.nombre || e}</span>).reduce((a, b) => [a, " + ", b])
                          : item.vehiculo && <span>{item.vehiculo === "otro" ? item.vehiculo_otro : item.vehiculo}</span>}
                        {item.origen && <span>{item.origen}{item.destino ? ` → ${item.destino}` : ""}</span>}
                        {item.pax_transp && <span>👥 {item.pax_transp}</span>}
                        {item.recepcion && <span>📍 {item.recepcion === "otro" ? item.recepcion_otro : item.recepcion}</span>}
                        {item.hora_llegada && <span>🕐 Llegada: {item.hora_llegada}</span>}
                        {Number(item.costo) > 0 && <span style={{ color: B.sand }}>💰 {COP(item.costo)}</span>}
                        {item.proveedor_transp && <span style={{ color: B.sky }}>🏢 {item.proveedor_transp}</span>}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {item.responsable && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>👤 {item.responsable === "__otro" ? item.responsable_otro : item.responsable}</span>}
                      {item.proveedor && item.tipo !== "transp_terrestre" && item.tipo !== "transp_acuatica" && <span style={{ fontSize: 11, color: B.sky }}>🏢 {item.proveedor}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    {/* Estado selector */}
                    {!readOnly ? (
                      <select value={item.estado || "pendiente"}
                        onChange={e => setEstado(item.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ background: "transparent", border: `1px solid ${ESTADOS_TL.find(x=>x.key===item.estado)?.color||"rgba(255,255,255,0.2)"}`,
                          color: ESTADOS_TL.find(x=>x.key===item.estado)?.color || "rgba(255,255,255,0.5)",
                          borderRadius: 20, padding: "3px 8px", fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer",
                          appearance: "none" }}>
                        {ESTADOS_TL.map(e => <option key={e.key} value={e.key} style={{ background: B.navyMid, color: "#fff" }}>{e.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, color: ESTADOS_TL.find(x=>x.key===item.estado)?.color || "rgba(255,255,255,0.4)", fontWeight: 700 }}>
                        {ESTADOS_TL.find(x=>x.key===item.estado)?.label || item.estado}
                      </span>
                    )}
                    {!readOnly && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
                        <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tareas del bloque */}
                {!readOnly && (
                  <div style={{ marginTop: 8, borderTop: `1px solid ${B.navyLight}44`, paddingTop: 6 }}>
                    {/* Tasks list */}
                    {(item.tareas||[]).length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        {(item.tareas||[]).map(t => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
                            <button onClick={() => toggleTask(item.id, t.id)}
                              style={{ width: 16, height: 16, borderRadius: 3, border: t.completada ? "none" : "1.5px solid rgba(255,255,255,0.2)",
                                background: t.completada ? B.success : "transparent", color: "#fff", fontSize: 9, cursor: "pointer", flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {t.completada && "✓"}
                            </button>
                            <span style={{ flex: 1, color: t.completada ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)",
                              textDecoration: t.completada ? "line-through" : "none" }}>{t.texto}</span>
                            {t.asignado && <span style={{ color: B.sky, fontSize: 10 }}>👤 {t.asignado}</span>}
                            <button onClick={() => removeTask(item.id, t.id)} title="Eliminar tarea"
                              style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 4, color: B.danger, cursor: "pointer", fontSize: 10, padding: "2px 6px", fontWeight: 700 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add task toggle */}
                    {taskBlockId === item.id ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input value={newTask} onChange={e => setNewTask(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addTask(item.id); }}
                          placeholder="Nueva tarea..." autoFocus
                          style={{ flex: 1, background: "transparent", border: `1px solid ${B.navyLight}`, borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 11, outline: "none" }} />
                        <select value={newTaskAsignado} onChange={e => setNewTaskAsignado(e.target.value)}
                          style={{ background: B.navyLight, border: "none", borderRadius: 6, padding: "4px 6px", color: "#fff", fontSize: 10, outline: "none", maxWidth: 100 }}>
                          <option value="">Asignar a...</option>
                          {usuarios.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                          <option value="__otro">Otro</option>
                        </select>
                        {newTaskAsignado === "__otro" && (
                          <input value={newTaskOtro||""} onChange={e => setNewTaskOtro(e.target.value)} placeholder="Nombre..."
                            style={{ width: 80, background: "transparent", border: `1px solid ${B.navyLight}`, borderRadius: 6, padding: "4px 6px", color: "#fff", fontSize: 10, outline: "none" }} />
                        )}
                        <button onClick={() => addTask(item.id)} style={{ background: B.success, border: "none", borderRadius: 6, color: "#fff", padding: "4px 8px", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>+</button>
                        <button onClick={() => setTaskBlockId(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10 }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setTaskBlockId(item.id)}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 10, padding: "2px 0" }}>
                        + Agregar tarea
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulario */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
        <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 16 }}>{editIdx ? "Editar bloque" : "Nuevo bloque"}</div>

          {/* PASO 1: Seleccionar tipo de actividad */}
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>¿Qué actividad vas a agregar?</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TIPOS_TIMELINE.map(t => (
                <button key={t.key} type="button" onClick={() => set("tipo", t.key)}
                  style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${form.tipo === t.key ? t.color : "transparent"}`,
                    background: form.tipo === t.key ? t.color + "22" : B.navyLight,
                    color: form.tipo === t.key ? t.color : "rgba(255,255,255,0.5)",
                    fontSize: 12, fontWeight: form.tipo === t.key ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* PASO 2: Campos según el tipo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Día</label><Inp type="date" value={form.fecha} onChange={v => set("fecha", v)} /></div>
            <div><label style={LS}>Hora *</label><Inp type="time" value={form.hora} onChange={v => set("hora", v)} /></div>
            <div><label style={LS}>Duración (min)</label><Inp type="number" value={form.duracion} onChange={v => set("duracion", v)} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Título *</label><Inp value={form.titulo} onChange={v => set("titulo", v)} placeholder="Ej: Llegada de flores y decoración" /></div>
            {form.tipo !== "llegada" && form.tipo !== "pausa" && (
              <div style={{ gridColumn: "span 2" }}><label style={LS}>Descripción</label>
                <textarea value={form.descripcion||""} onChange={e => set("descripcion", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} />
              </div>
            )}
            <div>
              <label style={LS}>Encargado</label>
              <Sel value={form.responsable} onChange={v => set("responsable", v)}>
                <option value="">Sin asignar</option>
                {usuarios.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                <option value="__otro">Otro (escribir)</option>
              </Sel>
            </div>
            {form.responsable === "__otro" && (
              <div><label style={LS}>Nombre del encargado</label><Inp value={form.responsable_otro} onChange={v => set("responsable_otro", v)} placeholder="Nombre / cargo" /></div>
            )}
            {form.tipo !== "transp_terrestre" && form.tipo !== "transp_acuatica" && form.tipo !== "llegada" && form.tipo !== "pausa" && (
              <div><label style={LS}>Proveedor</label><Inp value={form.proveedor} onChange={v => set("proveedor", v)} placeholder="Empresa / proveedor" /></div>
            )}
            <div><label style={LS}>Estado</label>
              <Sel value={form.estado} onChange={v => set("estado", v)}>
                {ESTADOS_TL.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </Sel>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Ubicación</label>
              <Inp value={form.ubicacion} onChange={v => set("ubicacion", v)} placeholder="Ej: Kiosko Restaurante, Zona Playa, Cabañas..." />
            </div>

            {/* ── Sub-menú: Servicio F&B / Actividad ── */}
            {form.tipo !== "pausa" && (<>
              <div style={{ gridColumn: "span 2", borderTop: `1px solid ${B.navyLight}`, paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: form.tipo === "servicio" ? "#f97316" : B.success, marginBottom: 10 }}>
                  {form.tipo === "servicio" ? "🍽️ Detalles Servicio F&B" : "🎉 Detalles Actividad"}
                </div>

                {/* Vincular a servicios contratados (multi-select, solo F&B) */}
                {form.tipo === "servicio" && serviciosAB.length > 0 && (() => {
                  const usedInOther = new Set();
                  items.filter(x => x.id !== (editIdx || "")).forEach(x => {
                    (x.servicios_ids || []).forEach(id => usedInOther.add(id));
                    if (x.servicio_contratado_id) usedInOther.add(x.servicio_contratado_id);
                  });
                  const disponibles = serviciosAB.filter(s => !usedInOther.has(s.id) || (form.servicios_ids||[]).includes(s.id));
                  if (disponibles.length === 0) return (
                    <div style={{ marginBottom: 14 }}>
                      <label style={LS}>Servicios contratados</label>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: 8 }}>Todos los servicios ya están asignados a otros bloques.</div>
                    </div>
                  );
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <label style={LS}>Servicios contratados (selecciona uno o varios)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {disponibles.map(s => {
                          const ids = form.servicios_ids || [];
                          const sel = ids.includes(s.id);
                          return (
                            <div key={s.id} onClick={() => {
                              const next = sel ? ids.filter(id => id !== s.id) : [...ids, s.id];
                              set("servicios_ids", next);
                              if (!sel && !form.titulo) set("titulo", s.descripcion || s.categoria);
                            }}
                              style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                                border: `2px solid ${sel ? "#f97316" : "transparent"}`,
                                background: sel ? "#f97316" + "11" : B.navyLight,
                                display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: sel ? "none" : "2px solid rgba(255,255,255,0.15)",
                                background: sel ? "#f97316" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#fff", fontSize: 11, flexShrink: 0 }}>{sel && "✓"}</div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: sel ? 700 : 400, color: sel ? "#f97316" : "rgba(255,255,255,0.6)" }}>
                                  {s.descripcion || s.categoria}
                                </div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                                  {s.categoria}{s.cantidad > 1 ? ` · ${s.cantidad} pax` : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {(form.servicios_ids||[]).length > 0 && (
                        <div style={{ fontSize: 11, color: "#f97316", marginTop: 6 }}>
                          {(form.servicios_ids||[]).length} servicio{(form.servicios_ids||[]).length > 1 ? "s" : ""} seleccionado{(form.servicios_ids||[]).length > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <label style={LS}>Tipo de servicio</label>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {[
                    { key: "interno",  label: "Interno",                  color: B.success },
                    { key: "externo",  label: "Proveedor Externo",        color: B.sky },
                    { key: "cliente",  label: "Coordinado por Cliente",   color: B.warning },
                  ].map(m => (
                    <button key={m.key} type="button" onClick={() => set("servicio_modalidad", m.key)}
                      style={{ flex: 1, padding: "7px 4px", borderRadius: 8,
                        border: `2px solid ${form.servicio_modalidad === m.key ? m.color : "transparent"}`,
                        background: form.servicio_modalidad === m.key ? m.color + "22" : B.navyLight,
                        color: form.servicio_modalidad === m.key ? m.color : "rgba(255,255,255,0.5)",
                        fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </>)}

            {/* ── Sub-menú: Traslado (vincular a transporte) ── */}
            {form.tipo === "traslado" && transportes.length > 0 && (
              <div style={{ gridColumn: "span 2", borderTop: `1px solid ${B.navyLight}`, paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#a78bfa", marginBottom: 10 }}>🚢 Vincular a Transporte</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {transportes.map(t => {
                    const sel = form.transporte_id === t.id;
                    const tColor = { ida: B.success, vuelta: B.sky, transfer: B.sand, privado: "#a78bfa", proveedor: B.warning }[t.tipo] || B.sky;
                    const tLabel = { ida: "⛵ Zarpe", vuelta: "🔄 Regreso", transfer: "🚌 Transfer", privado: "🚤 Privado", proveedor: "🚚 Proveedor" }[t.tipo] || t.tipo;
                    return (
                      <div key={t.id} onClick={() => {
                        set("transporte_id", sel ? "" : t.id);
                        if (!sel && !form.titulo) set("titulo", `${tLabel} — ${t.embarcacion}`);
                      }}
                        style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${sel ? "#a78bfa" : "transparent"}`,
                          background: sel ? "#a78bfa" + "22" : B.navyLight, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: sel ? "#a78bfa" : "rgba(255,255,255,0.6)" }}>
                            {tLabel} — {t.embarcacion}
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                            🕐 {t.hora || "—"} · 👥 {t.pax || "—"} pax{t.muelle ? ` · 📍 ${t.muelle}` : ""}
                          </div>
                        </div>
                        {sel && <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
                {transportes.length === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 12 }}>
                    No hay transportes registrados. Agrega transportes en el tab ⛵ Transporte.
                  </div>
                )}
              </div>
            )}
            {form.tipo === "traslado" && transportes.length === 0 && (
              <div style={{ gridColumn: "span 2", padding: "12px 16px", background: B.warning + "11", border: `1px solid ${B.warning}33`, borderRadius: 10, fontSize: 12, color: B.warning }}>
                ⚠ No hay transportes registrados. Crea transportes en el tab ⛵ Transporte para vincularlos a este traslado.
              </div>
            )}

            {/* ── Sub-menú: Llegada ── */}
            {form.tipo === "llegada" && (
              <div style={{ gridColumn: "span 2", borderTop: `1px solid ${B.navyLight}`, paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", marginBottom: 10 }}>📍 Punto de Llegada</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {MUELLE_OPCIONES.map(m => (
                    <button key={m} type="button" onClick={() => set("muelle", m)}
                      style={{ padding: "9px 16px", borderRadius: 10, border: `2px solid ${form.muelle === m ? "#10b981" : "transparent"}`,
                        background: form.muelle === m ? "#10b981" + "22" : B.navyLight,
                        color: form.muelle === m ? "#10b981" : "rgba(255,255,255,0.5)",
                        fontSize: 13, fontWeight: form.muelle === m ? 700 : 400, cursor: "pointer" }}>
                      {m}
                    </button>
                  ))}
                  <button type="button" onClick={() => set("muelle", "otro")}
                    style={{ padding: "9px 16px", borderRadius: 10, border: `2px solid ${form.muelle === "otro" ? "#10b981" : "transparent"}`,
                      background: form.muelle === "otro" ? "#10b981" + "22" : B.navyLight,
                      color: form.muelle === "otro" ? "#10b981" : "rgba(255,255,255,0.5)",
                      fontSize: 13, fontWeight: form.muelle === "otro" ? 700 : 400, cursor: "pointer" }}>
                    Otro
                  </button>
                </div>
                {form.muelle === "otro" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={LS}>Especificar punto de llegada</label>
                    <Inp value={form.muelle_otro||""} onChange={v => set("muelle_otro", v)} placeholder="Ej: Marina Santa Cruz..." />
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={LS}>Pax</label><Inp type="number" value={form.pax_transp} onChange={v => set("pax_transp", v)} placeholder="# personas" /></div>
                </div>
              </div>
            )}

            {/* ── Sub-menú: Transportación ── */}
            {(form.tipo === "transp_terrestre" || form.tipo === "transp_acuatica") && (<>
              <div style={{ gridColumn: "span 2", borderTop: `1px solid ${B.navyLight}`, paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: form.tipo === "transp_terrestre" ? "#fb923c" : "#38bdf8", marginBottom: 10 }}>
                  {form.tipo === "transp_terrestre" ? "🚐 Detalles Transporte Terrestre" : "⛵ Detalles Transporte Acuático"}
                </div>
                {/* Modalidad */}
                <label style={LS}>Modalidad del servicio</label>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {MODALIDAD_SERVICIO.map(m => (
                    <button key={m.key} type="button" onClick={() => set("modalidad", m.key)}
                      style={{ flex: 1, padding: "7px 4px", borderRadius: 8,
                        border: `2px solid ${form.modalidad === m.key ? m.color : "transparent"}`,
                        background: form.modalidad === m.key ? m.color + "22" : B.navyLight,
                        color: form.modalidad === m.key ? m.color : "rgba(255,255,255,0.5)",
                        fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.tipo === "transp_terrestre" ? (
                <div><label style={LS}>Vehículo</label>
                  <Sel value={form.vehiculo} onChange={v => set("vehiculo", v)}>
                    <option value="">Seleccionar...</option>
                    {VEHICULOS_TERRESTRES.map(v => <option key={v} value={v}>{v}</option>)}
                    <option value="otro">Otro (escribir)</option>
                  </Sel>
                </div>
              ) : (
                <div style={{ gridColumn: "span 2" }}>
                  <label style={LS}>Embarcaciones (selecciona una o varias)</label>
                  {(() => {
                    const lista = embarcacionesEvento.length > 0 ? embarcacionesEvento : VEHICULOS_ACUATICOS.map((v, i) => ({ id: `gen-${i}`, nombre: v, capacidad: 0 }));
                    const selEmbs = form.embarcaciones_sel || [];
                    const selNames = new Set(selEmbs.map(e => e.nombre || e));
                    const capTotal = selEmbs.reduce((s, e) => s + (e.capacidad || 0), 0);
                    const pax = Number(form.pax_transp) || 0;
                    return (
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {lista.map(e => {
                            const sel = selNames.has(e.nombre);
                            return (
                              <div key={e.id || e.nombre} onClick={() => {
                                const next = sel ? selEmbs.filter(x => (x.nombre || x) !== e.nombre) : [...selEmbs, { id: e.id, nombre: e.nombre, capacidad: e.capacidad || 0 }];
                                set("embarcaciones_sel", next);
                                set("vehiculo", next.map(x => x.nombre || x).join(" + "));
                              }}
                                style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                                  border: `2px solid ${sel ? "#38bdf8" : "transparent"}`,
                                  background: sel ? "#38bdf8" + "15" : B.navyLight,
                                  display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 18, height: 18, borderRadius: 4, border: sel ? "none" : "2px solid rgba(255,255,255,0.15)",
                                  background: sel ? "#38bdf8" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "#fff", fontSize: 11, flexShrink: 0 }}>{sel && "✓"}</div>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: sel ? 700 : 400, color: sel ? "#38bdf8" : "rgba(255,255,255,0.6)" }}>{e.nombre}</div>
                                  {e.capacidad > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Cap. {e.capacidad}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {selEmbs.length > 0 && (
                          <div style={{ fontSize: 11, color: capTotal >= pax && pax > 0 ? B.success : pax > 0 ? B.warning : "rgba(255,255,255,0.4)" }}>
                            {selEmbs.length} embarcación{selEmbs.length > 1 ? "es" : ""} · Capacidad: {capTotal}
                            {pax > 0 && (capTotal >= pax ? ` ✓ cubre ${pax} pax` : ` ⚠ faltan ${pax - capTotal} pax`)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              {form.vehiculo === "otro" && (
                <div><label style={LS}>Especificar</label><Inp value={form.vehiculo_otro||""} onChange={v => set("vehiculo_otro", v)} /></div>
              )}
              <div><label style={LS}>Número de pasajeros *</label><Inp type="number" value={form.pax_transp} onChange={v => set("pax_transp", v)} placeholder="# personas" /></div>
              <div><label style={LS}>Hora llegada</label><Inp type="time" value={form.hora_llegada} onChange={v => set("hora_llegada", v)} /></div>
              <div><label style={LS}>Origen</label><Inp value={form.origen} onChange={v => set("origen", v)} placeholder="Punto de partida" /></div>
              <div><label style={LS}>Destino</label><Inp value={form.destino} onChange={v => set("destino", v)} placeholder="Punto de llegada" /></div>
              {/* Recepción */}
              <div><label style={LS}>Punto de recepción</label>
                <Sel value={form.recepcion} onChange={v => set("recepcion", v)}>
                  <option value="">Sin especificar</option>
                  {RECEPCION_OPCIONES.map(r => <option key={r} value={r}>{r}</option>)}
                  <option value="otro">Otro</option>
                </Sel>
              </div>
              {form.recepcion === "otro" && (
                <div><label style={LS}>Especificar recepción</label><Inp value={form.recepcion_otro||""} onChange={v => set("recepcion_otro", v)} /></div>
              )}
              {/* Proveedor (tercerizado) */}
              {form.modalidad === "tercerizado" && (<>
                <div><label style={LS}>Proveedor</label><Inp value={form.proveedor_transp} onChange={v => set("proveedor_transp", v)} placeholder="Empresa" /></div>
                <div><label style={LS}>Contacto proveedor</label><Inp value={form.contacto_proveedor} onChange={v => set("contacto_proveedor", v)} placeholder="Tel / nombre" /></div>
              </>)}
              {form.modalidad !== "incluida" && (
                <div><label style={LS}>Costo</label><Inp type="number" value={form.costo} onChange={v => set("costo", v)} placeholder="$0" /></div>
              )}
            </>)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar bloque</button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

// ─── TRANSPORTE ───────────────────────────────────────────────────────────────
const FLOTA_OPC = ["Caribe I", "Coral II", "Atolon III", "Sunrise", "Palmera", "Transporte externo", "Van privada", "Bus"];
const EMPTY_TRANSP = { id: "", tipo: "ida", embarcacion: "", fecha: "", hora: "", pax: "", muelle: "", notas: "", estado: "pendiente" };

const SALIDAS_PASADIA = [
  { id: "S1", label: "Primera Salida — 08:30" },
  { id: "S2", label: "Segunda Salida — 10:00" },
  { id: "S3", label: "Tercera Salida — 11:30" },
  { id: "S4", label: "Cuarta Salida — 12:30" },
];

function TabTransporte({ items, onChange, embarcacionesEvento, onChangeEmbarcaciones, timelineItems = [], evento, updateLocal }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_TRANSP);
  const [embarcacionesDB, setEmbarcacionesDB] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load embarcaciones from DB
  useEffect(() => {
    if (!supabase) return;
    supabase.from("embarcaciones").select("id, nombre, tipo, capacidad, propiedad, estado, matricula").eq("estado", "activo").order("nombre")
      .then(({ data }) => setEmbarcacionesDB(data || []));
  }, []);

  const selIds = new Set((embarcacionesEvento || []).map(e => e.id));
  const toggleEmb = (emb) => {
    const current = embarcacionesEvento || [];
    if (selIds.has(emb.id)) {
      onChangeEmbarcaciones(current.filter(e => e.id !== emb.id));
    } else {
      onChangeEmbarcaciones([...current, { id: emb.id, nombre: emb.nombre, tipo: emb.tipo, capacidad: emb.capacidad, matricula: emb.matricula }]);
    }
  };

  const TIPOS_TR = [
    { key: "ida",       label: "⛵ Zarpe (Ida)",          color: B.success },
    { key: "vuelta",    label: "🔄 Regreso",              color: B.sky },
    { key: "transfer",  label: "🚌 Transfer terrestre",    color: B.sand },
    { key: "privado",   label: "🚤 Servicio privado",      color: "#a78bfa" },
    { key: "proveedor", label: "🚚 Llegada proveedor",     color: B.warning },
  ];
  const typeColor = (t) => TIPOS_TR.find(x => x.key === t)?.color || B.sky;
  const typeLabel = (t) => TIPOS_TR.find(x => x.key === t)?.label || t;

  const sorted = [...items].sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")));

  const openNew  = () => { setForm(EMPTY_TRANSP); setEditId(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY_TRANSP, ...item }); setEditId(item.id); setShowForm(true); };
  const save = () => {
    if (!form.hora || !form.embarcacion) return;
    const item = { ...form, id: form.id || uid() };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));
  const setEstado = (id, estado) => onChange(items.map(x => x.id === id ? { ...x, estado } : x));

  const ESTADOS_TR = ["pendiente","confirmado","en_camino","completado","cancelado"];
  const estadoColor = { pendiente: "rgba(255,255,255,0.4)", confirmado: B.sky, en_camino: B.warning, completado: B.success, cancelado: B.danger };
  const embsEvento = embarcacionesEvento || [];

  return (
    <div>
      {/* ── Compartir lancha con pasadías ── */}
      {evento && updateLocal && (
        <div style={{ background: `${B.sand}11`, borderRadius: 12, padding: "14px 18px", marginBottom: 16, border: `1px solid ${B.sand}33` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!evento.comparte_lancha_pasadias}
                  onChange={e => {
                    updateLocal("comparte_lancha_pasadias", e.target.checked);
                    if (!e.target.checked) updateLocal("salida_compartida_id", null);
                  }}
                  style={{ width: 18, height: 18 }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: B.sand }}>🚤 Compartir lancha con pasadías</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    El grupo usa la salida regular de pasadías y consume sus cupos disponibles
                  </div>
                </div>
              </label>
            </div>
            {evento.comparte_lancha_pasadias && (
              <div>
                <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "block" }}>Salida</label>
                <select
                  value={evento.salida_compartida_id || ""}
                  onChange={e => updateLocal("salida_compartida_id", e.target.value || null)}
                  style={{ padding: "8px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.sand}55`, color: B.white, fontSize: 13, cursor: "pointer", minWidth: 220 }}
                >
                  <option value="">— Seleccionar —</option>
                  {SALIDAS_PASADIA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Embarcaciones asignadas al evento ── */}
      <div style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", marginBottom: 20, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>⛵ Embarcaciones del evento</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {embsEvento.length} seleccionada{embsEvento.length !== 1 ? "s" : ""} · Cap. total: {embsEvento.reduce((s, e) => s + (e.capacidad || 0), 0)}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {embarcacionesDB.map(emb => {
            const sel = selIds.has(emb.id);
            return (
              <div key={emb.id} onClick={() => toggleEmb(emb)}
                style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${sel ? B.sky : "transparent"}`,
                  background: sel ? B.sky + "15" : B.navyLight,
                  display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: sel ? "none" : "2px solid rgba(255,255,255,0.15)",
                  background: sel ? B.sky : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 12, flexShrink: 0 }}>{sel && "✓"}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: sel ? B.sky : "rgba(255,255,255,0.6)" }}>{emb.nombre}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                    {emb.tipo || "Embarcación"} · Cap. {emb.capacidad}{emb.matricula ? ` · ${emb.matricula}` : ""} · {emb.propiedad}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Traslados ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>🚢 Traslados</div>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar traslado</button>
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay traslados registrados. Agrega el primero.
        </div>
      )}

      {/* ── Transportes desde Rundown (solo lectura) ── */}
      {(() => {
        const rundownTransp = (timelineItems || []).filter(b => b.tipo === "transp_terrestre" || b.tipo === "transp_acuatica")
          .sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")));
        if (rundownTransp.length === 0) return null;
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>📋 Desde Rundown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rundownTransp.map(b => {
                const esAcuatica = b.tipo === "transp_acuatica";
                const color = esAcuatica ? "#38bdf8" : "#fb923c";
                const icon = esAcuatica ? "⛵" : "🚐";
                const embs = b.embarcaciones_sel?.length > 0 ? b.embarcaciones_sel.map(e => e.nombre || e).join(" + ") : (b.vehiculo === "otro" ? b.vehiculo_otro : b.vehiculo);
                const modLabel = { incluida: "Incluida", cliente: "Serv. Cliente", tercerizado: "Tercerizado" }[b.modalidad] || "";
                return (
                  <div key={b.id} style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", borderLeft: `4px solid ${color}`, opacity: 0.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{icon} {b.titulo || (esAcuatica ? "Transporte Acuático" : "Transporte Terrestre")}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {b.fecha && <span>{new Date(b.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>}
                          {b.hora && <span>🕐 {b.hora}</span>}
                          {embs && <span>🚢 {embs}</span>}
                          {b.pax_transp && <span>👥 {b.pax_transp} pax</span>}
                          {b.origen && <span>{b.origen}{b.destino ? ` → ${b.destino}` : ""}</span>}
                          {modLabel && <span style={{ color }}>{modLabel}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: color + "22", color, fontWeight: 700 }}>Rundown</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Traslados manuales ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px",
            borderLeft: `4px solid ${typeColor(item.tipo)}`, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center", minWidth: 64 }}>
              {item.fecha && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>{new Date(item.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</div>}
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", color: typeColor(item.tipo) }}>{item.hora}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: typeColor(item.tipo), fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{typeLabel(item.tipo)}</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{item.embarcacion}</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {item.pax    && <span>👥 {item.pax} pax</span>}
                {item.muelle && <span>⚓ {item.muelle}</span>}
                {item.notas  && <span>📝 {item.notas}</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <select value={item.estado || "pendiente"} onChange={e => setEstado(item.id, e.target.value)}
                style={{ background: "transparent", border: `1px solid ${estadoColor[item.estado]||"rgba(255,255,255,0.2)"}`,
                  color: estadoColor[item.estado] || "rgba(255,255,255,0.4)", borderRadius: 20, padding: "3px 10px",
                  fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer", appearance: "none" }}>
                {ESTADOS_TR.map(e => <option key={e} value={e} style={{ background: B.navyMid }}>{e}</option>)}
              </select>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar traslado" : "Nuevo traslado"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Fecha *</label><Inp type="date" value={form.fecha} onChange={v => set("fecha", v)} /></div>
            <div><label style={LS}>Hora *</label><Inp type="time" value={form.hora} onChange={v => set("hora", v)} /></div>
            <div><label style={LS}>Tipo</label>
              <Sel value={form.tipo} onChange={v => set("tipo", v)}>
                {TIPOS_TR.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Sel>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Embarcación / Vehículo *</label>
              <Sel value={form.embarcacion} onChange={v => set("embarcacion", v)}>
                <option value="">Seleccionar</option>
                {embsEvento.length > 0 && <optgroup label="Embarcaciones del evento">
                  {embsEvento.map(e => <option key={e.id} value={e.nombre}>{e.nombre} — {e.tipo || "Embarcación"} · Cap. {e.capacidad}</option>)}
                </optgroup>}
                <optgroup label="Otros">
                  {["Transporte externo", "Van privada", "Bus", "Otro"].map(f => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              </Sel>
            </div>
            <div><label style={LS}>Pax</label><Inp type="number" value={form.pax} onChange={v => set("pax", v)} /></div>
            <div><label style={LS}>Muelle / Punto</label><Inp value={form.muelle} onChange={v => set("muelle", v)} placeholder="Ej: Muelle Bodeguita Puerta 4" /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas adicionales</label><Inp value={form.notas} onChange={v => set("notas", v)} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CONTACTOS RÁPIDOS ────────────────────────────────────────────────────────
const ROLES_CONTACTO = ["Cliente","Coordinador evento","Proveedor AV","Proveedor catering","Proveedor decoración","Proveedor fotografía","Staff Atolon","Capitán","Seguridad","Otro"];
// ─── Contratistas del evento ─────────────────────────────────────────────
// Campos extendidos para el registro express (eventos → contratistas):
// nit, direccion, telefono, rut_url, descripcion en empresa;
// fecha_nacimiento en cada persona. Se mantienen vacíos en la carga manual
// y se llenan cuando el contratista usa el link público.
const EMPTY_CTR = {
  id: "", nombre: "", tipo: "externo", cargo: "", funcion: "", costo: "", contacto: "",
  nit: "", direccion: "", telefono: "", rut_url: "", descripcion: "",
  personas: [], notas: "",
};
const EMPTY_PERSONA = { nombre: "", cedula: "", fecha_nacimiento: "", rol: "", arl_url: "" };

// Helper para subir archivo ARL al bucket y devolver URL pública
async function uploadArl(file, eventoId) {
  if (!file || !supabase) return null;
  const ext = file.name.split(".").pop() || "bin";
  const path = `contratistas/${eventoId || "misc"}/arl-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true, contentType: file.type });
  if (error) { alert("Error subiendo ARL: " + error.message); return null; }
  const { data } = supabase.storage.from("b2b-docs").getPublicUrl(path);
  return data?.publicUrl || null;
}
// Helper para subir RUT de la empresa
async function uploadRut(file, eventoId) {
  if (!file || !supabase) return null;
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `contratistas/${eventoId || "misc"}/rut-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true, contentType: file.type });
  if (error) { alert("Error subiendo RUT: " + error.message); return null; }
  const { data } = supabase.storage.from("b2b-docs").getPublicUrl(path);
  return data?.publicUrl || null;
}
function TabContratistas({ items, onChange, eventoId, evento }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_CTR);
  const [showInstructivo, setShowInstructivo] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => { setForm(EMPTY_CTR); setEditId(null); setShowForm(true); };
  const openEdit = (it) => { setForm({ ...EMPTY_CTR, ...it }); setEditId(it.id); setShowForm(true); };
  const save = () => {
    if (!form.nombre.trim()) return;
    const clean = { ...form, id: form.id || uid(), personas: (form.personas || []).filter(p => p.nombre?.trim()) };
    if (editId) onChange(items.map(x => x.id === editId ? clean : x));
    else onChange([...items, clean]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  // Generar (o reutilizar) el token de gestión para un contratista existente
  // — sirve tanto para los cargados a mano como para los express que no lo
  // tengan. Lo guarda en el array de contratistas del evento de inmediato
  // para que el link sirva aunque el modal aún no se haya guardado.
  const generarTokenGestion = (id) => {
    const existing = items.find(x => x.id === id);
    if (!existing) return null;
    if (existing.gestion_token) return existing.gestion_token;
    const t = (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 24);
    onChange(items.map(x => x.id === id ? { ...x, gestion_token: t } : x));
    if (editId === id) set("gestion_token", t);
    return t;
  };
  const copiarLinkGestion = (id) => {
    const t = generarTokenGestion(id);
    if (!t) return;
    const url = `${window.location.origin}/contratistas/registro/${encodeURIComponent(eventoId)}/${encodeURIComponent(t)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => alert(`📎 Link copiado:\n${url}\n\nMándaselo al contratista para que continúe cargando información.`));
    } else {
      prompt("Copia el link:", url);
    }
  };

  const addPersona = () => set("personas", [...(form.personas || []), { ...EMPTY_PERSONA }]);
  const setPersona = (i, k, v) => set("personas", (form.personas || []).map((p, j) => j === i ? { ...p, [k]: v } : p));
  const rmPersona = (i) => set("personas", (form.personas || []).filter((_, j) => j !== i));
  const subirArlPersona = async (i, file) => {
    const url = await uploadArl(file, eventoId);
    if (url) setPersona(i, "arl_url", url);
  };

  const tipoColor = (t) => t === "propio" ? B.sky : B.sand;
  const totalPersonas = items.reduce((s, c) => s + ((c.personas || []).length), 0);
  const totalCosto = items.reduce((s, c) => s + (Number(c.costo) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          {items.length} contratista{items.length !== 1 ? "s" : ""} · {totalPersonas} persona{totalPersonas !== 1 ? "s" : ""}{totalCosto > 0 ? ` · ${COP(totalCosto)}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowInstructivo(true)}
            style={{ ...BTN(B.navyLight), color: B.sand, border: `1px solid ${B.sand}55` }}
            title="Genera PDF con los requisitos para que los contratistas accedan a Atolon">
            📄 Instructivo PDF
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}/contratistas/registro/${encodeURIComponent(eventoId)}`;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(url)
                  .then(() => alert(`📎 Link copiado:\n${url}\n\nMándaselo al contratista por WhatsApp o email. Llena empresa + personas + RUT + ARL y aparecerán aquí.`))
                  .catch(() => prompt("Copia el link:", url));
              } else {
                prompt("Copia el link:", url);
              }
            }}
            style={{ ...BTN(B.navyLight), color: B.sky, border: `1px solid ${B.sky}55` }}
            title="Genera el link público express para que el contratista se registre solo">
            📎 Link registro express
          </button>
          <button onClick={openNew} style={BTN(B.success)}>+ Agregar contratista</button>
        </div>
      </div>

      {showInstructivo && (
        <InstructivoContratistasPDF evento={evento} onClose={() => setShowInstructivo(false)} />
      )}

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay contratistas registrados. Agrega proveedores externos (DJ, decoración, flores…) o personal propio asignado.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {items.map(c => (
          <div key={c.id} style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", borderLeft: `4px solid ${tipoColor(c.tipo)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: tipoColor(c.tipo), textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {c.tipo === "propio" ? "🏷️ Propio" : "🤝 Externo"} {c.cargo ? `· ${c.cargo}` : ""}
                  {c.registro_express && (
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: B.sky + "33", color: B.sky, fontWeight: 700, letterSpacing: 0 }}>
                      🌐 Express
                    </span>
                  )}
                </div>
                <div onClick={() => openEdit(c)} style={{ fontSize: 15, fontWeight: 800, marginTop: 4, cursor: "pointer" }} title="Click para ver/editar todos los datos">{c.nombre}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => openEdit(c)} style={{ ...BTN(B.navyLight), padding: "2px 8px", fontSize: 11 }} title="Ver / Editar">✏</button>
                <button onClick={() => remove(c.id)} style={{ ...BTN(B.danger + "33"), padding: "2px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
            {c.funcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 8, lineHeight: 1.5 }}>🎯 {c.funcion}</div>}
            <div style={{ background: B.navyLight, borderRadius: 8, padding: "8px 10px", marginBottom: 8, fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.55 }}>
              {c.nit && <div>🆔 NIT: <strong style={{ color: "#fff" }}>{c.nit}</strong></div>}
              {c.telefono && <div>📞 {c.telefono}</div>}
              {c.direccion && <div>📍 {c.direccion}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: (c.nit || c.telefono || c.direccion) ? 4 : 0 }}>
                  {c.rut_url && (
                    <a href={c.rut_url} target="_blank" rel="noreferrer"
                      style={{ color: B.success, textDecoration: "none", fontSize: 11, fontWeight: 700, border: `1px solid ${B.success}55`, borderRadius: 5, padding: "2px 8px" }}>
                      📎 Ver RUT
                    </a>
                  )}
                  <button
                    onClick={() => copiarLinkGestion(c.id)}
                    style={{ background: "transparent", color: B.sky, fontSize: 11, fontWeight: 700, border: `1px solid ${B.sky}55`, borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>
                    🔗 {c.gestion_token ? "Copiar link del contratista" : "Generar link de gestión"}
                  </button>
                </div>
              </div>
            {c.contacto && <div style={{ fontSize: 12, color: B.sky, marginBottom: 6 }}>📞 {c.contacto}</div>}
            {Number(c.costo) > 0 && <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, marginBottom: 6 }}>💵 {COP(c.costo)}</div>}
            {(c.personas || []).length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}` }}>
                <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
                  👥 Personal ({c.personas.length})
                </div>
                {c.personas.map((p, i) => (
                  <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", padding: "3px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.nombre}
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>
                        {p.cedula ? ` · ${p.cedula}` : ""}
                        {p.fecha_nacimiento ? ` · 🎂 ${p.fecha_nacimiento}` : ""}
                        {p.rol ? ` · ${p.rol}` : ""}
                      </span>
                    </span>
                    {p.arl_url ? (
                      <a href={p.arl_url} target="_blank" rel="noreferrer" title="Ver ARL adjunta"
                        style={{ color: B.success, textDecoration: "none", fontSize: 10, fontWeight: 700, border: `1px solid ${B.success}55`, borderRadius: 5, padding: "1px 6px" }}>
                        ARL ✓
                      </a>
                    ) : (
                      <span style={{ color: B.warning, fontSize: 10, fontWeight: 700, border: `1px solid ${B.warning}55`, borderRadius: 5, padding: "1px 6px" }}>sin ARL</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {c.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8, fontStyle: "italic" }}>"{c.notas}"</div>}
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar contratista" : "Nuevo contratista"}</div>

          {/* Link de gestión del contratista — siempre disponible. Si no
              tiene token aún (cargado a mano), un botón lo genera al vuelo. */}
          {editId && !form.gestion_token && (
            <div style={{ background: B.navyMid, border: `1px dashed ${B.sky}55`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: B.sky, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                🔗 Link personal del contratista
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8, lineHeight: 1.5 }}>
                Este contratista todavía no tiene un link de gestión. Genera uno para mandárselo y que pueda continuar cargando información (personal, ARLs, RUT).
              </div>
              <button
                onClick={() => copiarLinkGestion(editId)}
                style={{ ...BTN(B.sky), color: B.navy, fontSize: 12, fontWeight: 800 }}>
                🔗 Generar y copiar link
              </button>
            </div>
          )}
          {form.gestion_token && (() => {
            const gestionUrl = `${window.location.origin}/contratistas/registro/${encodeURIComponent(eventoId)}/${encodeURIComponent(form.gestion_token)}`;
            return (
              <div style={{ background: B.navyMid, border: `1px solid ${B.sky}55`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: B.sky, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  🔗 Link personal del contratista
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8, lineHeight: 1.5 }}>
                  Este es el link que se le creó cuando se registró. Lo puede usar para volver a cargar más personal o archivos. Si lo perdió, cópiaselo y mándaselo de nuevo.
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input readOnly value={gestionUrl}
                    onFocus={e => e.target.select()}
                    style={{ flex: 1, minWidth: 220, padding: "8px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 11, fontFamily: "monospace", outline: "none" }} />
                  <button
                    onClick={() => {
                      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(gestionUrl).then(() => alert("✓ Link copiado"));
                      else prompt("Copia el link:", gestionUrl);
                    }}
                    style={{ ...BTN(B.sky), color: B.navy, fontSize: 11, fontWeight: 800 }}>
                    📋 Copiar
                  </button>
                  <a href={gestionUrl} target="_blank" rel="noreferrer"
                    style={{ ...BTN(B.navyLight), color: B.sand, fontSize: 11, textDecoration: "none", display: "inline-block" }}>
                    Abrir ↗
                  </a>
                </div>
              </div>
            );
          })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Nombre / Empresa *</label><Inp value={form.nombre} onChange={v => set("nombre", v)} placeholder="Ej: DJ Ritmo Caribe" /></div>
            <div>
              <label style={LS}>Tipo</label>
              <Sel value={form.tipo} onChange={v => set("tipo", v)}>
                <option value="externo">🤝 Externo (proveedor)</option>
                <option value="propio">🏷️ Propio (empleado Atolón)</option>
              </Sel>
            </div>
            <div><label style={LS}>Cargo / Servicio</label><Inp value={form.cargo} onChange={v => set("cargo", v)} placeholder="Ej: DJ, Decoración, Foto…" /></div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>¿Qué van a hacer?</label>
              <textarea value={form.funcion} onChange={e => set("funcion", e.target.value)} rows={2}
                placeholder="Ej: Pone música ambiente de 3pm a 9pm, cocteles a la llegada"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            {/* Datos legales / contacto de empresa (vienen del registro express o se llenan a mano) */}
            <div><label style={LS}>NIT</label><Inp value={form.nit || ""} onChange={v => set("nit", v)} placeholder="900123456-7" /></div>
            <div><label style={LS}>Teléfono</label><Inp value={form.telefono || ""} onChange={v => set("telefono", v)} placeholder="+57 300..." /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Dirección</label><Inp value={form.direccion || ""} onChange={v => set("direccion", v)} placeholder="Calle 1 # 2-3, Cartagena" /></div>
            {/* RUT — ver el cargado o reemplazar */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>RUT</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {form.rut_url ? (
                  <>
                    <a href={form.rut_url} target="_blank" rel="noreferrer"
                      style={{ color: B.success, textDecoration: "none", fontSize: 12, fontWeight: 700, border: `1px solid ${B.success}55`, borderRadius: 6, padding: "5px 10px" }}>
                      ✓ Ver RUT cargado
                    </a>
                    <input type="file" accept=".pdf,image/*" id="rut-replace" style={{ display: "none" }}
                      onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const url = await uploadRut(f, eventoId); if (url) set("rut_url", url); e.target.value = ""; }} />
                    <label htmlFor="rut-replace" style={{ cursor: "pointer", color: B.sand, fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px dashed ${B.sand}55` }}>
                      🔄 Reemplazar
                    </label>
                    <button type="button" onClick={() => set("rut_url", "")} style={{ ...BTN(B.navyLight), fontSize: 10, padding: "4px 8px" }}>Quitar</button>
                  </>
                ) : (
                  <>
                    <input type="file" accept=".pdf,image/*" id="rut-upload" style={{ display: "none" }}
                      onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const url = await uploadRut(f, eventoId); if (url) set("rut_url", url); e.target.value = ""; }} />
                    <label htmlFor="rut-upload" style={{ cursor: "pointer", color: B.sky, fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px dashed ${B.sky}55` }}>
                      📎 Adjuntar RUT (PDF / imagen)
                    </label>
                  </>
                )}
              </div>
            </div>
            <div><label style={LS}>Contacto (tel / email)</label><Inp value={form.contacto} onChange={v => set("contacto", v)} placeholder="+57 300..." /></div>
            <div><label style={LS}>Costo (COP)</label><Inp type="number" value={form.costo} onChange={v => set("costo", v)} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas</label><Inp value={form.notas} onChange={v => set("notas", v)} placeholder="Llega 2h antes, necesita enchufe, etc." /></div>
          </div>

          {/* Lista de personal */}
          <div style={{ marginTop: 18, borderTop: `1px solid ${B.navyLight}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>
                👥 Personal que viene ({(form.personas || []).length})
              </div>
              <button onClick={addPersona} style={{ ...BTN(B.navyLight), fontSize: 11 }}>+ Agregar persona</button>
            </div>
            {(form.personas || []).map((p, i) => (
              <div key={i} style={{ background: B.navyMid, borderRadius: 8, padding: 10, marginBottom: 8, border: `1px solid ${B.navyLight}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1.3fr 1.3fr auto", gap: 8, marginBottom: 8 }}>
                  <Inp value={p.nombre} onChange={v => setPersona(i, "nombre", v)} placeholder="Nombre" />
                  <Inp value={p.cedula} onChange={v => setPersona(i, "cedula", v)} placeholder="Cédula" />
                  <input type="date" value={p.fecha_nacimiento || ""}
                    onChange={e => setPersona(i, "fecha_nacimiento", e.target.value)} title="Fecha de nacimiento"
                    style={{ padding: "9px 10px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  <Inp value={p.rol} onChange={v => setPersona(i, "rol", v)} placeholder="Rol (DJ, mesero…)" />
                  <button onClick={() => rmPersona(i)} style={{ ...BTN(B.danger + "33"), color: B.danger, padding: "0 10px", fontSize: 14 }}>✕</button>
                </div>
                {/* ARL adjunta */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 36 }}>ARL</span>
                  {p.arl_url ? (
                    <>
                      <a href={p.arl_url} target="_blank" rel="noreferrer" style={{ color: B.success, textDecoration: "none", fontSize: 11, flex: 1 }}>
                        ✓ Ver ARL adjunta
                      </a>
                      <button onClick={() => setPersona(i, "arl_url", "")} style={{ ...BTN(B.navyLight), fontSize: 10, padding: "2px 8px" }}>Quitar</button>
                    </>
                  ) : (
                    <>
                      <input type="file" accept=".pdf,image/*" id={`arl-${i}`} style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) subirArlPersona(i, f); e.target.value = ""; }} />
                      <label htmlFor={`arl-${i}`} style={{ cursor: "pointer", color: B.sky, fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px dashed ${B.sky}55` }}>
                        📎 Adjuntar ARL (PDF / imagen)
                      </label>
                    </>
                  )}
                </div>
              </div>
            ))}
            {(form.personas || []).length === 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                Sin personas registradas aún.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_CONT = { id: "", nombre: "", rol: "Cliente", telefono: "", email: "", empresa: "", notas: "" };

function TabContactos({ items, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_CONT);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const ROL_COLORS = { Cliente: B.sand, "Coordinador evento": B.success, "Staff Atolon": B.sky };
  const rolColor = (r) => ROL_COLORS[r] || "rgba(255,255,255,0.5)";

  const openEdit = (item) => { setForm({ ...EMPTY_CONT, ...item }); setEditId(item.id); setShowForm(true); };
  const openNew  = () => { setForm(EMPTY_CONT); setEditId(null); setShowForm(true); };
  const save = () => {
    if (!form.nombre) return;
    const item = { ...form, id: form.id || uid() };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar contacto</button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay contactos registrados.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", borderTop: `3px solid ${rolColor(item.rol)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: rolColor(item.rol), textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.rol}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "2px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "2px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{item.nombre}</div>
            {item.empresa && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{item.empresa}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {item.telefono && (
                <a href={`tel:${item.telefono}`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
                  background: B.success + "22", borderRadius: 8, padding: "8px 12px", color: B.success, fontWeight: 700, fontSize: 13 }}>
                  📞 {item.telefono}
                </a>
              )}
              {item.telefono && (
                <a href={`https://wa.me/${item.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
                    background: "#25D36622", borderRadius: 8, padding: "8px 12px", color: "#25D366", fontWeight: 700, fontSize: 13 }}>
                  💬 WhatsApp
                </a>
              )}
              {item.email && (
                <a href={`mailto:${item.email}`} style={{ fontSize: 12, color: B.sky, textDecoration: "none" }}>✉ {item.email}</a>
              )}
            </div>
            {item.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8, fontStyle: "italic" }}>"{item.notas}"</div>}
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar contacto" : "Nuevo contacto"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Nombre *</label><Inp value={form.nombre} onChange={v => set("nombre", v)} /></div>
            <div><label style={LS}>Rol</label>
              <Sel value={form.rol} onChange={v => set("rol", v)}>
                {ROLES_CONTACTO.map(r => <option key={r} value={r}>{r}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Empresa</label><Inp value={form.empresa} onChange={v => set("empresa", v)} /></div>
            <div><label style={LS}>Teléfono</label><Inp value={form.telefono} onChange={v => set("telefono", v)} placeholder="+57 300..." /></div>
            <div><label style={LS}>Email</label><Inp type="email" value={form.email} onChange={v => set("email", v)} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas</label><Inp value={form.notas} onChange={v => set("notas", v)} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DIETAS Y ALERGIAS ────────────────────────────────────────────────────────
function TabDietas({ items, paxTotal, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const EMPTY = { id: "", nombre: "", pax: 1, restricciones: [], alergias: [], menu_especial: "", notas: "" };
  const [form, setForm]         = useState(EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [customAlergia, setCustomAlergia] = useState("");

  const toggleArr = (arr, val) => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  const openNew  = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY, ...item, restricciones: item.restricciones||[], alergias: item.alergias||[] }); setEditId(item.id); setShowForm(true); };
  const save = () => {
    if (!form.nombre) return;
    const item = { ...form, id: form.id || uid(), pax: Number(form.pax) || 1 };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  // Resumen
  const allRestr = items.flatMap(x => (x.restricciones||[]).map(r => r));
  const restrCount = allRestr.reduce((m, r) => { m[r] = (m[r]||0) + 1; return m; }, {});
  const allAlerg = items.flatMap(x => (x.alergias||[]).map(a => a));
  const alergCount = allAlerg.reduce((m, a) => { m[a] = (m[a]||0) + 1; return m; }, {});

  return (
    <div>
      {/* Resumen global */}
      {items.length > 0 && (
        <div style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Resumen — {items.reduce((s,x) => s + (x.pax||1), 0)} de {paxTotal} pax con restricciones
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.entries(restrCount).map(([r, n]) => (
              <Pill key={r} label={`${r} (${n})`} color={B.warning} />
            ))}
          </div>
          {Object.keys(alergCount).length > 0 && (
            <>
              <div style={{ fontSize: 11, color: B.danger, marginBottom: 6, fontWeight: 700 }}>⚠ ALERGIAS:</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(alergCount).map(([a, n]) => (
                  <Pill key={a} label={`${a} (${n})`} color={B.danger} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar restricción</button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Sin restricciones dietéticas registradas.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px",
            borderLeft: `4px solid ${(item.alergias||[]).length > 0 ? B.danger : B.warning}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                  {item.nombre}
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 8 }}>{item.pax > 1 ? `(${item.pax} personas)` : ""}</span>
                </div>
                {(item.restricciones||[]).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {item.restricciones.map(r => <Pill key={r} label={r} color={B.warning} />)}
                  </div>
                )}
                {(item.alergias||[]).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: B.danger, fontWeight: 700 }}>⚠ ALERGIA:</span>
                    {item.alergias.map(a => <Pill key={a} label={a} color={B.danger} />)}
                  </div>
                )}
                {item.menu_especial && <div style={{ fontSize: 12, color: B.sky, marginTop: 4 }}>🍽 Menú especial: {item.menu_especial}</div>}
                {item.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>"{item.notas}"</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar restricción" : "Nueva restricción dietética"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Nombre / Grupo *</label><Inp value={form.nombre} onChange={v => set("nombre", v)} placeholder="Ej: Mesa 3 — familia García" /></div>
            <div><label style={LS}>Cantidad de personas</label><Inp type="number" value={form.pax} onChange={v => set("pax", v)} /></div>
            <div><label style={LS}>Menú especial solicitado</label><Inp value={form.menu_especial} onChange={v => set("menu_especial", v)} placeholder="Ej: Sin proteína animal" /></div>
          </div>

          {/* Restricciones */}
          <div style={{ marginTop: 16 }}>
            <label style={LS}>Restricciones dietéticas</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {RESTRICCIONES_BASE.map(r => (
                <button key={r} onClick={() => set("restricciones", toggleArr(form.restricciones, r))}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600,
                    background: form.restricciones.includes(r) ? B.warning : B.warning + "22",
                    color:      form.restricciones.includes(r) ? "#fff" : B.warning }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Alergias */}
          <div style={{ marginTop: 16 }}>
            <label style={{ ...LS, color: B.danger }}>⚠ Alergias (pueden ser peligrosas)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, marginBottom: 10 }}>
              {form.alergias.map(a => (
                <Pill key={a} label={a} color={B.danger} onRemove={() => set("alergias", form.alergias.filter(x => x !== a))} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Inp value={customAlergia} onChange={setCustomAlergia} placeholder="Escribir alergia + Enter" style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === "Enter" && customAlergia.trim()) { set("alergias", [...form.alergias, customAlergia.trim()]); setCustomAlergia(""); }}} />
              <button onClick={() => { if (customAlergia.trim()) { set("alergias", [...form.alergias, customAlergia.trim()]); setCustomAlergia(""); }}}
                style={BTN(B.danger)}>+ Agregar</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}><label style={LS}>Notas adicionales</label>
            <textarea value={form.notas||""} onChange={e => set("notas", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BITÁCORA DE INCIDENTES ───────────────────────────────────────────────────
const PRIORIDAD_INC = [
  { key: "info",    label: "ℹ Info",     color: B.sky },
  { key: "alerta",  label: "⚠ Alerta",  color: B.warning },
  { key: "critico", label: "🚨 Crítico", color: B.danger },
];

// ─── TAB BEO ──────────────────────────────────────────────────────────────────
const BEO_SECCIONES = [
  { key: "ventas",        label: "EQUIPO VENTAS-GRUPOS" },
  { key: "cocina",        label: "COCINA" },
  { key: "areas",         label: "ÁREAS PÚBLICAS — BAÑOS" },
  { key: "hospedaje",     label: "HOTEL — HOSPEDAJE" },
  { key: "transp",        label: "TRANSPORTACIÓN" },
  { key: "ayb_servicio",  label: "A & B + SERVICIO" },
  { key: "mantenimiento", label: "MANTENIMIENTO" },
  { key: "ayb_cocina",    label: "A & B COCINA" },
  { key: "jardineria",    label: "JARDINERÍA — PLAYA — PISCINA" },
  { key: "bares",         label: "A & B BARES" },
  { key: "prevencion",    label: "EQUIPO PREVENCIÓN" },
  { key: "happenings",    label: "HAPPENINGS" },
  { key: "comentarios",   label: "COMENTARIOS / ADICIONALES" },
  { key: "contabilidad",  label: "CONTABILIDAD" },
];
function TabBEO({ evento, notas, onChange, onDownload, readOnly }) {
  const [form, setForm] = useState(notas || {});
  useEffect(() => { setForm(notas || {}); }, [notas]);
  const set = (k, v) => {
    const nf = { ...form, [k]: v };
    setForm(nf);
    onChange?.(nf);
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>📋 Banquet Event Order</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Notas manuales por sección — se agregan al BEO auto-generado</div>
        </div>
        {onDownload && <button onClick={onDownload} style={{ ...BTN(B.navyLight), border: `1px solid ${B.sand}`, color: B.sand }}>📋 Descargar BEO</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {BEO_SECCIONES.map(s => (
          <div key={s.key} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{s.label}</div>
            <textarea
              value={form[s.key] || ""}
              onChange={e => set(s.key, e.target.value)}
              disabled={readOnly}
              placeholder="Agregar nota manual…"
              rows={3}
              style={{ width: "100%", background: B.navyLight, border: `1px solid ${B.navyLight}`, borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, resize: "vertical", fontFamily: "inherit", outline: "none" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TabBitacora({ items, onChange, historial = [] }) {
  const [form, setForm] = useState({ descripcion: "", prioridad: "info", reportado_por: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const add = () => {
    if (!form.descripcion.trim()) return;
    const now = new Date();
    const hora = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
    const item = { ...form, id: uid(), hora, timestamp: now.toISOString(), resuelto: false };
    onChange([item, ...items]);
    setForm({ descripcion: "", prioridad: "info", reportado_por: form.reportado_por });
  };

  const toggleResuelto = (id) => onChange(items.map(x => x.id === id ? { ...x, resuelto: !x.resuelto } : x));
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  return (
    <div>
      {/* Formulario rápido */}
      <div style={{ background: B.navy, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📝 Registrar novedad</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={LS}>Descripción *</label>
            <Inp value={form.descripcion} onChange={v => set("descripcion", v)} placeholder="Describe la novedad o incidente…"
              onKeyDown={e => e.key === "Enter" && add()} />
          </div>
          <div>
            <label style={LS}>Prioridad</label>
            <Sel value={form.prioridad} onChange={v => set("prioridad", v)}>
              {PRIORIDAD_INC.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Sel>
          </div>
          <div>
            <label style={LS}>Reportado por</label>
            <Inp value={form.reportado_por} onChange={v => set("reportado_por", v)} placeholder="Nombre…" style={{ width: 140 }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={add} style={BTN(B.success)}>Registrar</button>
        </div>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 32, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Sin novedades registradas.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(item => {
          const pc = PRIORIDAD_INC.find(x => x.key === item.prioridad) || PRIORIDAD_INC[0];
          return (
            <div key={item.id} style={{ background: item.resuelto ? B.navy : B.navyMid,
              borderRadius: 10, padding: "12px 16px", borderLeft: `4px solid ${item.resuelto ? "rgba(255,255,255,0.1)" : pc.color}`,
              opacity: item.resuelto ? 0.5 : 1, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ minWidth: 48, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: item.resuelto ? "rgba(255,255,255,0.3)" : pc.color }}>{item.hora}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pc.color }}>{pc.label}</span>
                  {item.reportado_por && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>por {item.reportado_por}</span>}
                  {item.resuelto && <span style={{ fontSize: 11, color: B.success, fontWeight: 700 }}>✓ Resuelto</span>}
                </div>
                <div style={{ fontSize: 13, textDecoration: item.resuelto ? "line-through" : "none" }}>{item.descripcion}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleResuelto(item.id)} style={{ ...BTN(item.resuelto ? B.navyLight : B.success + "33"), padding: "3px 10px", fontSize: 11, color: item.resuelto ? "rgba(255,255,255,0.4)" : B.success, border: `1px solid ${item.resuelto ? B.navyLight : B.success + "66"}` }}>
                  {item.resuelto ? "Reabrir" : "Resolver"}
                </button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "22"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Historial automático de cambios ── */}
      {historial.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            📜 Historial de cambios
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· Registro automático</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 500, overflowY: "auto" }}>
            {historial.map(h => {
              const ts = new Date(h.timestamp);
              const fecha = ts.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
              const hora = ts.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
              const accionColor = h.accion === "agregó" ? B.success : h.accion === "eliminó" ? B.danger : B.sky;
              return (
                <div key={h.id} style={{ display: "flex", gap: 10, padding: "8px 12px", background: B.navy, borderRadius: 8, fontSize: 12, borderLeft: `3px solid ${accionColor}` }}>
                  <div style={{ minWidth: 80, color: "rgba(255,255,255,0.4)", fontSize: 10, whiteSpace: "nowrap" }}>
                    {fecha} {hora}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div>
                      <span style={{ color: B.sky, fontWeight: 600 }}>{h.usuario}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}> {h.accion} </span>
                      <span style={{ color: "rgba(255,255,255,0.8)" }}>{h.descripcion}</span>
                    </div>
                    {(h.antes != null || h.despues != null) && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                        <span style={{ color: B.danger, textDecoration: "line-through" }}>{h.antes || "—"}</span>
                        <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.4)" }}>→</span>
                        <span style={{ color: B.success, fontWeight: 600 }}>{h.despues || "—"}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODO STAFF (Vista simplificada para el día del evento) ───────────────────
export const ModoStaffReadOnly = (props) => <ModoStaff {...props} readOnly={true} />;

function ModoStaff({ evento, timeline, contactos, transporte, incidentes, onUpdateTimeline, readOnly = false }) {
  const [now, setNow] = useState(nowHH());
  const [expanded, setExpanded] = useState({});
  const [filtroDia, setFiltroDia] = useState(null); // YYYY-MM-DD o null = todos
  const [filtroEstado, setFiltroEstado] = useState("activos"); // activos | todos | completados

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setNow(nowHH()), 30000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(() =>
    [...timeline].sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")))
  , [timeline]);

  // Fechas únicas para filtro de día
  const fechas = useMemo(() => Array.from(new Set(sorted.map(b => b.fecha).filter(Boolean))).sort(), [sorted]);

  // Aplicar filtros
  const visibles = useMemo(() => {
    let arr = sorted;
    if (filtroDia) arr = arr.filter(b => b.fecha === filtroDia);
    if (filtroEstado === "activos") arr = arr.filter(b => b.estado !== "completado");
    if (filtroEstado === "completados") arr = arr.filter(b => b.estado === "completado");
    return arr;
  }, [sorted, filtroDia, filtroEstado]);

  // Índice del bloque actual (hora del sistema ≥ hora del bloque < siguiente)
  const currentIdx = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return sorted.findIndex((it, i) => {
      if (it.fecha && it.fecha !== hoy) return false;
      const next = sorted[i + 1];
      return (it.hora || "") <= now && (!next || (next.hora || "") > now || next.fecha !== hoy);
    });
  }, [sorted, now]);

  // Stats de avance
  const total = sorted.length;
  const completados = sorted.filter(b => b.estado === "completado").length;
  const enCurso = sorted.filter(b => b.estado === "en_curso").length;
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0;

  const criticos = incidentes.filter(x => x.prioridad === "critico" && !x.resuelto);
  const alergias = (evento.restricciones_dieteticas||[]).filter(x => (x.alergias||[]).length > 0);

  // Cambiar estado de un bloque
  const setBlockEstado = (blockId, estado) => {
    if (readOnly) return;
    const next = timeline.map(b => b.id === blockId ? { ...b, estado, _lastUpdate: new Date().toISOString() } : b);
    onUpdateTimeline?.(next);
  };

  // Toggle tarea dentro de un bloque
  const toggleTarea = (blockId, tareaId) => {
    if (readOnly) return;
    const next = timeline.map(b => {
      if (b.id !== blockId) return b;
      const tareas = (b.tareas || []).map(t =>
        t.id === tareaId ? { ...t, completada: !t.completada, _completed_at: !t.completada ? new Date().toISOString() : null } : t
      );
      return { ...b, tareas };
    });
    onUpdateTimeline?.(next);
  };

  const ESTADO_COLORS = {
    pendiente:  { bg: "transparent",        border: B.navyLight,     text: "rgba(255,255,255,0.7)", label: "Pendiente" },
    en_curso:   { bg: `${B.warning}22`,     border: B.warning,       text: B.warning,               label: "En curso" },
    completado: { bg: `${B.success}18`,     border: `${B.success}66`, text: B.success,              label: "Completado" },
  };

  const fmtFechaCorta = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }) : "";

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", paddingBottom: 40 }}>
      {readOnly && (
        <div style={{ background: `${B.sky}15`, border: `1px solid ${B.sky}44`, borderRadius: 10, padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>👁️</span>
          <span style={{ fontSize: 11, color: B.sky, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Vista solo lectura</span>
        </div>
      )}

      {/* Header con reloj + progreso */}
      <div style={{ background: B.navy, borderRadius: 14, padding: "18px 20px", marginBottom: 14, border: `1px solid ${B.sand}33` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Ahora</div>
            <div style={{ fontSize: 42, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1, color: "#fff" }}>{now}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Evento</div>
            <div style={{ fontSize: 13, fontWeight: 700, maxWidth: 200 }}>{evento.nombre}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{fmtFecha(evento.fecha)}</div>
          </div>
        </div>
        {/* Barra de progreso */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span>Avance</span>
            <span>{completados}/{total} · {pct}%</span>
          </div>
          <div style={{ height: 6, background: B.navyLight, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${B.success}, ${B.sand})`, transition: "width 0.3s" }} />
          </div>
          {enCurso > 0 && <div style={{ fontSize: 10, color: B.warning, marginTop: 4 }}>🔶 {enCurso} en curso</div>}
        </div>
      </div>

      {/* Alertas */}
      {alergias.length > 0 && (
        <div style={{ background: B.danger + "18", border: `1px solid ${B.danger}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: B.danger, marginBottom: 4 }}>⚠ ALERGIAS ({alergias.length})</div>
          {alergias.slice(0, 3).map(a => (
            <div key={a.id} style={{ fontSize: 11 }}><strong>{a.nombre}</strong>: {a.alergias.join(", ")}</div>
          ))}
        </div>
      )}
      {criticos.length > 0 && (
        <div style={{ background: B.danger + "33", border: `2px solid ${B.danger}`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: B.danger, marginBottom: 4 }}>🚨 INCIDENTES ACTIVOS</div>
          {criticos.map(c => <div key={c.id} style={{ fontSize: 11 }}>• {c.descripcion}</div>)}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {fechas.length > 1 && (
          <>
            <button onClick={() => setFiltroDia(null)}
              style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${filtroDia === null ? B.sand : B.navyLight}`, background: filtroDia === null ? `${B.sand}22` : "transparent", color: filtroDia === null ? B.sand : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Todo
            </button>
            {fechas.map(f => (
              <button key={f} onClick={() => setFiltroDia(f === filtroDia ? null : f)}
                style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${filtroDia === f ? B.sand : B.navyLight}`, background: filtroDia === f ? `${B.sand}22` : "transparent", color: filtroDia === f ? B.sand : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {fmtFechaCorta(f)}
              </button>
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        {[
          { k: "activos", l: "Activos" },
          { k: "completados", l: "✓" },
          { k: "todos", l: "Todo" },
        ].map(b => (
          <button key={b.k} onClick={() => setFiltroEstado(b.k)}
            style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${filtroEstado === b.k ? B.sky : B.navyLight}`, background: filtroEstado === b.k ? `${B.sky}22` : "transparent", color: filtroEstado === b.k ? B.sky : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {b.l}
          </button>
        ))}
      </div>

      {/* Lista de bloques interactivos (BEO interactivo) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibles.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            {filtroEstado === "completados" ? "Sin bloques completados todavía" : "Sin bloques pendientes"}
          </div>
        )}
        {visibles.map(item => {
          const isExp = expanded[item.id];
          const estado = item.estado || "pendiente";
          const estCfg = ESTADO_COLORS[estado] || ESTADO_COLORS.pendiente;
          const color = tipoColor(item.tipo);
          const isCurr = sorted[currentIdx]?.id === item.id;
          const tareas = item.tareas || [];
          const tareasDone = tareas.filter(t => t.completada).length;
          const hasTareas = tareas.length > 0;
          const resp = item.responsable === "__otro" ? (item.responsable_otro || "") : (item.responsable || "");
          const respPhone = (contactos || []).find(c => c.nombre?.toLowerCase() === (resp || "").toLowerCase())?.telefono;

          return (
            <div key={item.id}
              style={{
                background: estCfg.bg,
                border: `1px solid ${estCfg.border}`,
                borderLeft: `4px solid ${isCurr ? B.warning : color}`,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: isCurr ? `0 0 20px ${B.warning}33` : "none",
              }}>
              {/* Header — click toggle expand */}
              <div onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !isExp }))}
                style={{ display: "flex", gap: 12, padding: "14px 14px", cursor: "pointer", alignItems: "flex-start" }}>
                <div style={{ minWidth: 54, textAlign: "center" }}>
                  <div style={{ fontSize: isCurr ? 22 : 18, fontWeight: 900, color: isCurr ? B.warning : color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{item.hora || "—"}</div>
                  {item.duracion && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.duracion}′</div>}
                  {item.fecha && fechas.length > 1 && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2, textTransform: "uppercase" }}>{new Date(item.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                    {tipoLabel(item.tipo)}
                    {isCurr && <span style={{ marginLeft: 6, background: B.warning, color: B.navy, padding: "1px 6px", borderRadius: 8, fontSize: 9 }}>AHORA</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3, marginBottom: 4 }}>{item.titulo || ""}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                    {resp && <span>👤 {resp}</span>}
                    {item.proveedor && <span>🏢 {item.proveedor}</span>}
                    {item.ubicacion && <span>📍 {item.ubicacion}</span>}
                    {item.pax_transp && <span>👥 {item.pax_transp} pax</span>}
                    {hasTareas && <span style={{ color: tareasDone === tareas.length ? B.success : B.sand }}>☑ {tareasDone}/{tareas.length}</span>}
                  </div>
                </div>
                {/* Chip estado */}
                <div style={{
                  alignSelf: "flex-start",
                  fontSize: 9,
                  fontWeight: 800,
                  color: estCfg.text,
                  border: `1px solid ${estCfg.border}`,
                  borderRadius: 10,
                  padding: "3px 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                }}>
                  {estCfg.label}
                </div>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${estCfg.border}33` }}>
                  {item.descripcion && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, marginTop: 10, fontStyle: "italic" }}>
                      {item.descripcion}
                    </div>
                  )}

                  {/* Tareas con checkbox */}
                  {hasTareas && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontWeight: 700 }}>
                        Checklist ({tareasDone}/{tareas.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {tareas.map(t => (
                          <div key={t.id} onClick={() => toggleTarea(item.id, t.id)}
                            style={{
                              display: "flex", gap: 10, alignItems: "flex-start",
                              padding: "8px 10px",
                              background: t.completada ? `${B.success}18` : B.navyLight,
                              borderRadius: 8,
                              cursor: "pointer",
                              border: `1px solid ${t.completada ? `${B.success}55` : "transparent"}`,
                            }}>
                            <div style={{
                              width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                              background: t.completada ? B.success : "transparent",
                              border: `2px solid ${t.completada ? B.success : "rgba(255,255,255,0.25)"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fff", fontSize: 14, fontWeight: 900,
                            }}>{t.completada && "✓"}</div>
                            <div style={{ fontSize: 12, flex: 1, lineHeight: 1.4, color: t.completada ? "rgba(255,255,255,0.5)" : "#fff", textDecoration: t.completada ? "line-through" : "none" }}>
                              {t.texto}
                              {t.asignado && <span style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginLeft: 6 }}>— {t.asignado}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botones de contacto con responsable */}
                  {(resp || item.proveedor) && (
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {respPhone && (
                        <>
                          <a href={`tel:${respPhone}`}
                            style={{ flex: 1, minWidth: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", background: B.success, color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                            📞 Llamar
                          </a>
                          <a href={`https://wa.me/${respPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${resp}, te contacto desde el evento "${evento.nombre}" sobre: ${item.titulo}`)}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ flex: 1, minWidth: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", background: "#25D366", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                            💬 WhatsApp
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  {/* Botones de cambio de estado (ocultos en modo solo-lectura) */}
                  {!readOnly && (
                    <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                      {estado !== "pendiente" && (
                        <button onClick={() => setBlockEstado(item.id, "pendiente")}
                          style={{ flex: 1, padding: "10px", borderRadius: 8, background: B.navyLight, color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          ⟲ Pendiente
                        </button>
                      )}
                      {estado !== "en_curso" && (
                        <button onClick={() => setBlockEstado(item.id, "en_curso")}
                          style={{ flex: 1, padding: "10px", borderRadius: 8, background: `${B.warning}33`, color: B.warning, border: `1px solid ${B.warning}66`, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          ▶ En curso
                        </button>
                      )}
                      {estado !== "completado" && (
                        <button onClick={() => setBlockEstado(item.id, "completado")}
                          style={{ flex: 1, padding: "10px", borderRadius: 8, background: B.success, color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          ✓ Completar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Contactos rápidos (footer) */}
      {contactos.filter(c => c.telefono).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>Contactos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contactos.filter(c => c.telefono).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: B.navyMid, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{c.nombre}</div>
                  {c.rol && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.rol}</div>}
                </div>
                <a href={`tel:${c.telefono}`}
                  style={{ padding: "6px 10px", background: B.success, borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                  📞
                </a>
                <a href={`https://wa.me/${c.telefono.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: "6px 10px", background: "#25D366", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                  💬
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SERVICIOS CONTRATADOS ────────────────────────────────────────────────────
const CATS_SERV = ["Menú Restaurante","Menú Bebidas","Menú Banquetes","Espacios Renta","Hospedaje","Transportación Acuática","Transportación Terrestre","Otros Servicios"];
const CATS_TO_TIPO = {
  "Menú Restaurante":       "restaurant",
  "Menú Bebidas":           "bebidas",
  "Menú Banquetes":         "banquetes",
  "Espacios Renta":         "espacios_renta",
  "Hospedaje":              "hospedaje",
  "Transportación Acuática":"trans_acuatica",
  "Transportación Terrestre":"transportacion",
  "Otros Servicios":        "otros_servicios",
};
const EMPTY_SERV = { id: "", categoria: "Menú Restaurante", proveedor: "", descripcion: "", valor: "", estado: "cotizando", notas: "", cantidad: 1, fecha: "", hora: "", iva: 0, tax_type: "iva" };

function CortesiaButton({ pasadiasMap, onAdd }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("");
  const [cant, setCant] = useState(1);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [feForm, setFeForm] = useState({ ...FE_EMPTY });
  const setFE = (k, v) => setFeForm(f => ({ ...f, [k]: v }));
  const tipos = Object.keys(pasadiasMap).map(k => pasadiasMap[k]?.nombre || k).filter(n => n !== "Impuesto Muelle");
  const FS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
  const LBL = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

  const reset = () => { setTipo(""); setCant(1); setNombre(""); setTelefono(""); setEmail(""); setFeForm({ ...FE_EMPTY }); };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ padding: "4px 12px", borderRadius: 8, border: `1px dashed ${B.success}55`, background: `${B.success}11`, color: B.success, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
        🎁 + Cortesía
      </button>
    );
  }

  return (
    <div onClick={e => e.target === e.currentTarget && setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>🎁 Pasadía de Cortesía</div>

        {/* Tipo de pasadía */}
        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Tipo de pasadía</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
            {tipos.map(t => (
              <button key={t} onClick={() => setTipo(t)} style={{
                padding: "10px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                background: tipo === t ? `${B.success}22` : B.navy,
                border: `1px solid ${tipo === t ? B.success : B.navyLight}`,
                color: tipo === t ? B.success : B.white, fontSize: 13, fontWeight: tipo === t ? 700 : 400,
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Datos del invitado */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: "12px 14px", marginBottom: 14 }}>
          <div>
            <label style={LBL}>Nombre del invitado</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" style={FS} />
          </div>
          <div>
            <label style={LBL}>Personas</label>
            <input type="number" value={cant} onChange={e => setCant(Number(e.target.value))} min={1} style={{ ...FS, textAlign: "center" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={LBL}>Teléfono</label>
            <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+57..." style={FS} />
          </div>
          <div>
            <label style={LBL}>Correo</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" style={FS} />
          </div>
        </div>

        {/* Facturación electrónica */}
        <div style={{ marginBottom: 14 }}>
          <FacturaElectronicaToggle checked={feForm.factura_electronica} onChange={v => setFE("factura_electronica", v)} theme="dark" />
          {feForm.factura_electronica && <FacturaElectronicaForm form={feForm} set={setFE} editing={true} theme="dark" />}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => { setOpen(false); reset(); }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.navyLight, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancelar</button>
          <button onClick={() => {
            if (!tipo) return alert("Selecciona un tipo de pasadía");
            if (!nombre.trim()) return alert("Nombre es obligatorio");
            const feFaltan = feValidate(feForm);
            if (feFaltan.length > 0) return alert("Faltan datos de facturación electrónica: " + feFaltan.map(k => k.replace("fe_","")).join(", "));
            onAdd(tipo, cant, { nombre: nombre.trim(), telefono, email, fe: fePayload(feForm) });
            setOpen(false); reset();
          }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.success, color: B.navy, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>🎁 Agregar cortesía</button>
        </div>
      </div>
    </div>
  );
}

function TabServicios({ items, onChange, pasadiasOrg = [], onChangePasadias, categoria, precioTipo = "publico", pasadiasMap = {}, cotizacionData = null, eventoId, eventoFecha, eventoNombre, evento = null, ocultarPrecios = false }) {
  // Vista operativa (cocina/maitre): ocultar todos los precios.
  // Shadowing: COP local devuelve "—" en lugar de "$X" cuando aplica,
  // así no hay que reescribir 15 lugares de UI individualmente.
  // eslint-disable-next-line no-shadow
  const COP = ocultarPrecios ? () => "—" : COPbrand;
  const [showForm, setShowForm] = useState(false);
  const [grupoCotOpen, setGrupoCotOpen] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_SERV);
  const [menuItems, setMenuItems]   = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Resolver precio adulto: precio_manual → lookup en tabla pasadias
  const resolverPrecio = (p) => {
    if (Number(p.precio_manual) > 0) return Number(p.precio_manual);
    const match = pasadiasMap[(p.tipo || "").toLowerCase()];
    if (match) return precioTipo === "neto" ? (match.precio_neto_agencia || 0) : (match.precio || 0);
    return 0;
  };
  // Resolver precio niño
  const resolverPrecioNino = (p) => {
    const match = pasadiasMap[(p.tipo || "").toLowerCase()];
    if (match) return precioTipo === "neto" ? (match.precio_neto_nino || 0) : (match.precio_nino || 0);
    return 0;
  };
  // Subtotal de una línea de pasadía considerando adultos + niños
  const subtotalLinea = (p) => {
    if (p.cortesia) return 0; // cortesías no cobran
    const adultos = Number(p.adultos) || 0;
    const ninos   = Number(p.ninos)   || 0;
    if (adultos > 0 || ninos > 0) {
      return resolverPrecio(p) * adultos + resolverPrecioNino(p) * ninos;
    }
    return resolverPrecio(p) * (Number(p.personas) || 0);
  };

  const comprasCliente = categoria === "grupo" ? (pasadiasOrg || []) : [];

  // Armar lista plana de items cotizados desde cotizacion_data
  const SECCIONES_COT = [
    { key: "espacios",  label: "Espacios" },
    { key: "alimentos", label: "Alimentos y Bebidas" },
    { key: "hospedaje", label: "Hospedaje" },
    { key: "servicios", label: "Servicios" },
  ];
  const itemsCotizados = cotizacionData
    ? SECCIONES_COT.flatMap(sec =>
        (cotizacionData[sec.key] || []).map(it => ({ ...it, _seccion: sec.label }))
      )
    : [];

  // Cargar productos de menu_items cuando cambia la categoría del formulario
  useEffect(() => {
    if (!showForm || !supabase) return;
    const tipo = CATS_TO_TIPO[form.categoria];
    if (!tipo) { setMenuItems([]); return; }
    setLoadingMenu(true);
    supabase.from("menu_items").select("id,nombre,descripcion,precio,categoria,tiene_iva")
      .eq("menu_tipo", tipo).eq("activo", true).order("categoria").order("orden")
      .then(({ data }) => { setMenuItems(data || []); setLoadingMenu(false); });
  }, [form.categoria, showForm]);

  // Agrupar items por subcategoría
  const menuPorCategoria = menuItems.reduce((acc, it) => {
    if (!acc[it.categoria]) acc[it.categoria] = [];
    acc[it.categoria].push(it);
    return acc;
  }, {});

  const seleccionarProducto = (it) => {
    setForm(f => ({ ...f, descripcion: it.nombre, valor: it.precio || "", notas: it.descripcion || f.notas }));
  };

  const ESTADOS_S = [
    { key: "cotizando",  label: "Cotizando",   color: "rgba(255,255,255,0.4)" },
    { key: "confirmado", label: "Confirmado",  color: B.success },
    { key: "pagado",     label: "Pagado",      color: B.sky },
    { key: "cancelado",  label: "Cancelado",   color: B.danger },
  ];
  const estColor = (e) => ESTADOS_S.find(x => x.key === e)?.color || "rgba(255,255,255,0.4)";

  const openNew  = () => { setForm(EMPTY_SERV); setEditId(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY_SERV, ...item }); setEditId(item.id); setShowForm(true); };
  const [dragIdx, setDragIdx] = useState(null);
  const save = () => {
    if (!form.categoria) return;
    const cant  = Number(form.cantidad) || 1;
    const unit  = Number(form.valor) || 0;
    const ivaPct = form.tax_type === "ninguno" ? 0 : (Number(form.iva) || 0);
    // valor = total con impuesto incluido (consistente con cotizacion_data
    // donde el P/L lee `valor` directamente sin volver a sumar IVA).
    const valor = unit * cant * (1 + ivaPct / 100);
    const item  = {
      ...form,
      id: form.id || uid(),
      cantidad: cant,
      valor_unit: unit,
      valor,
      iva: ivaPct,
      tax_type: form.tax_type === "ninguno" ? null : (form.tax_type || "iva"),
    };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));
  const setEstado = (id, estado) => onChange(items.map(x => x.id === id ? { ...x, estado } : x));

  const total = items.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const confirmados = items.filter(x => x.estado === "confirmado" || x.estado === "pagado").reduce((s, x) => s + (Number(x.valor)||0), 0);

  return (
    <div>
      {/* Botón de cotización (oculto en vista operativa — sin precios) */}
      {!ocultarPrecios && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => setGrupoCotOpen(true)}
            style={{ width: "100%", padding: "12px 18px", background: B.sand, color: B.navy, border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}
          >
            📥 Descargar cotización para cliente
          </button>
        </div>
      )}

      {/* ── Resumen de compra del cliente (grupos) ── */}
      {categoria === "grupo" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              🛒 Pasadías del grupo
            </div>
            {onChangePasadias && (
              <CortesiaButton pasadiasMap={pasadiasMap} onAdd={async (tipo, cant, datos) => {
                // 1) Crear reserva real en la tabla reservas
                const resId = `CORT-${Date.now()}`;
                const qr = `ATOLON-CORT-${Date.now()}`;
                if (supabase) {
                  await supabase.from("reservas").insert({
                    id: resId,
                    fecha: eventoFecha || new Date().toISOString().slice(0, 10),
                    tipo,
                    canal: "Cortesía",
                    nombre: datos.nombre,
                    email: datos.email || null,
                    telefono: datos.telefono || null,
                    pax: cant,
                    total: 0,
                    abono: 0,
                    saldo: 0,
                    estado: "confirmado",
                    forma_pago: "Cortesía",
                    qr_code: qr,
                    grupo_id: eventoId || null,
                    notas: `Cortesía — ${eventoNombre || "Grupo"}`,
                    ...(datos.fe || {}),
                  });
                }
                // 2) Agregar a pasadias_org
                const nueva = { id: "p-" + Date.now(), tipo, personas: String(cant), cortesia: true, precio_manual: "0", nombre: datos.nombre, telefono: datos.telefono, email: datos.email, reserva_id: resId };
                onChangePasadias([...pasadiasOrg, nueva]);
              }} />
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {comprasCliente.map((p, i) => {
              const adultos  = Number(p.adultos) || 0;
              const ninos    = Number(p.ninos)   || 0;
              const personas = Number(p.personas) || 0;
              const tieneDesglose = adultos > 0 || ninos > 0;
              const precio      = resolverPrecio(p);
              const precioNino  = resolverPrecioNino(p);
              const subtotal    = subtotalLinea(p);
              return (
                <div key={p.id || i} style={{ background: p.cortesia ? `${B.success}08` : B.navy, borderRadius: 10, padding: "12px 16px", border: p.cortesia ? `1px solid ${B.success}33` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{p.tipo}</span>
                        {p.cortesia && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${B.success}22`, color: B.success, fontWeight: 700 }}>🎁 CORTESÍA</span>}
                      </div>
                      {p.cortesia && p.nombre && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                          {p.nombre}{p.telefono ? ` · ${p.telefono}` : ""}{p.email ? ` · ${p.email}` : ""}
                          {p.reserva_id && (
                            <button onClick={(e) => { e.stopPropagation(); const url = `${window.location.origin}/zarpe-info?id=${p.reserva_id}`; navigator.clipboard.writeText(url).then(() => alert(`✓ Link de confirmación copiado:\n${url}`)).catch(() => prompt("Copia el link:", url)); }}
                              style={{ marginLeft: 8, background: "none", border: `1px solid ${B.sky}44`, borderRadius: 6, color: B.sky, fontSize: 10, cursor: "pointer", padding: "1px 8px" }}>
                              📋 Copiar confirmación
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {!tieneDesglose && (
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "right", minWidth: 90 }}>
                        {p.cortesia ? "Cortesía" : precio > 0 ? COP(precio) : "—"} × {personas}
                      </div>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 800, color: p.cortesia ? B.success : subtotal > 0 ? B.sand : "rgba(255,255,255,0.3)", fontFamily: "'Barlow Condensed', sans-serif", minWidth: 110, textAlign: "right" }}>
                      {p.cortesia ? `${personas} pax` : subtotal > 0 ? COP(subtotal) : "$0"}
                    </div>
                    {p.cortesia && onChangePasadias && (
                      <button onClick={() => onChangePasadias(pasadiasOrg.filter(x => x.id !== p.id))}
                        style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                    )}
                  </div>
                  {tieneDesglose && (
                    <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                      {adultos > 0 && <span>Adultos: {adultos} × {COP(precio)}</span>}
                      {ninos > 0 && <span>Niños: {ninos} × {COP(precioNino)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Total general */}
            {comprasCliente.length > 0 && (() => {
              const gran = comprasCliente.reduce((s, p) => s + subtotalLinea(p), 0);
              return gran > 0 ? (
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginRight: 12, alignSelf: "center" }}>TOTAL</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(gran)}</span>
                </div>
              ) : null;
            })()}
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "20px 0" }} />
        </div>
      )}

      {/* ── Resumen cotización (eventos con cotizacion_data) ── */}
      {itemsCotizados.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            📋 Lo cotizado
          </div>
          {SECCIONES_COT.map(sec => {
            const secItems = itemsCotizados.filter(it => it._seccion === sec.label);
            if (secItems.length === 0) return null;
            const secTotal = secItems.reduce((s, it) => {
              const base = (Number(it.cantidad)||1) * (Number(it.valor_unit)||0) * (Number(it.noches)||1);
              return s + base * (1 + (Number(it.iva)||0) / 100);
            }, 0);
            return (
              <div key={sec.key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, paddingLeft: 4 }}>{sec.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {secItems.map((it, i) => {
                    const base = (Number(it.cantidad)||1) * (Number(it.valor_unit)||0) * (Number(it.noches)||1);
                    const total = base * (1 + (Number(it.iva)||0) / 100);
                    return (
                      <div key={i} style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{it.concepto}</span>
                          {it.iva > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>+{it.iva}% IVA</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "right", minWidth: 120 }}>
                          {Number(it.cantidad) > 1 && <span>{it.cantidad} × </span>}
                          {COP(Number(it.valor_unit))}
                          {Number(it.noches) > 1 && <span> × {it.noches}n</span>}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", minWidth: 110, textAlign: "right" }}>
                          {COP(total)}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 4 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginRight: 12 }}>Subtotal {sec.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.7)", fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(secTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Total cotizado */}
          {(() => {
            const gran = itemsCotizados.reduce((s, it) => {
              const base = (Number(it.cantidad)||1) * (Number(it.valor_unit)||0) * (Number(it.noches)||1);
              return s + base * (1 + (Number(it.iva)||0) / 100);
            }, 0);
            return gran > 0 ? (
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginRight: 14, alignSelf: "center" }}>TOTAL COTIZADO</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(gran)}</span>
              </div>
            ) : null;
          })()}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "20px 0" }} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        {items.length > 1 && (
          <button onClick={() => onChange([...items].sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||""))))}
            style={{ ...BTN(B.navyLight), fontSize: 11, padding: "6px 12px" }}
            title="Reordenar todos los servicios cronológicamente">
            🕒 Ordenar por fecha
          </button>
        )}
        <button onClick={openNew} style={{ ...BTN(B.success), marginLeft: "auto" }}>+ Agregar servicio</button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay servicios contratados registrados.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, idx) => (
          <div key={item.id}
            draggable
            onDragStart={(e) => {
              setDragIdx(idx);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(idx));
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isNaN(from) || from === idx) { setDragIdx(null); return; }
              const arr = [...items];
              const [moved] = arr.splice(from, 1);
              arr.splice(idx, 0, moved);
              onChange(arr);
              setDragIdx(null);
            }}
            onDragEnd={() => setDragIdx(null)}
            style={{
              background: B.navy, borderRadius: 12, padding: "14px 18px",
              display: "flex", alignItems: "center", gap: 12,
              opacity: dragIdx === idx ? 0.4 : 1,
              border: dragIdx !== null && dragIdx !== idx ? `1px dashed ${B.sand}33` : "1px solid transparent",
            }}>
            <div title="Arrastrar para reordenar"
              style={{ color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "grab", userSelect: "none", padding: "0 4px", lineHeight: 1 }}>
              ⋮⋮
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{item.categoria}</span>
                <span style={{ fontSize: 11, color: estColor(item.estado), border: `1px solid ${estColor(item.estado)}44`, borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>{item.estado}</span>
                {(item.fecha || item.hora) && <span style={{ fontSize: 11, color: B.sky, fontWeight: 600 }}>
                  {item.fecha ? new Date(item.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : ""}
                  {item.hora ? ` · ${item.hora}` : ""}
                </span>}
                {item.iva > 0 && (
                  <span style={{ fontSize: 10, color: item.tax_type === "ico" ? "#fb923c" : "#4caf50", fontWeight: 700 }}>
                    {(item.tax_type || "iva").toUpperCase()} {item.iva}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{item.proveedor || item.descripcion}</div>
              {item.descripcion && item.proveedor && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{item.descripcion}</div>}
              {item.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, fontStyle: "italic" }}>"{item.notas}"</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              {item.valor > 0 && <>
                {item.cantidad > 1 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{item.cantidad} × {COP(item.valor_unit)}</div>}
                <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(item.valor)}</div>
              </>}
              <select value={item.estado||"cotizando"} onChange={e => setEstado(item.id, e.target.value)}
                style={{ background: "transparent", border: `1px solid ${estColor(item.estado)}44`, color: estColor(item.estado),
                  borderRadius: 8, padding: "3px 8px", fontSize: 11, outline: "none", cursor: "pointer", appearance: "none", marginTop: 6 }}>
                {ESTADOS_S.map(e => <option key={e.key} value={e.key} style={{ background: B.navyMid }}>{e.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
              <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Totales ── */}
      {(() => {
        const totalServicios = items.reduce((s, x) => s + (Number(x.valor) || 0), 0);
        const totalCompras   = comprasCliente.reduce((s, p) => s + subtotalLinea(p), 0);
        const totalGrupo     = totalServicios + totalCompras;
        return (
          <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {totalServicios > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: B.navy, borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Total Servicios</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalServicios)}</span>
              </div>
            )}
            {totalGrupo > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: B.navyMid, borderRadius: 10, border: `1px solid ${B.sky}33` }}>
                <span style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>Total Grupo</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalGrupo)}</span>
              </div>
            )}
          </div>
        );
      })()}

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar servicio" : "Nuevo servicio"}</div>

          {/* Categoría */}
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Categoría</label>
            <Sel value={form.categoria} onChange={v => { set("categoria", v); setForm(f => ({ ...f, categoria: v, descripcion: "", valor: "" })); }}>
              {CATS_SERV.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>

          {/* Selector de productos del módulo */}
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Seleccionar producto</label>
            {loadingMenu ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "10px 0" }}>Cargando productos…</div>
            ) : menuItems.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "10px 0" }}>Sin productos para esta categoría</div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingRight: 4 }}>
                {Object.entries(menuPorCategoria).map(([cat, its]) => (
                  <div key={cat}>
                    <div style={{ fontSize: 10, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 4px 4px" }}>{cat}</div>
                    {its.map(it => {
                      const seleccionado = form.descripcion === it.nombre;
                      return (
                        <button key={it.id} type="button" onClick={() => seleccionarProducto(it)}
                          style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, marginBottom: 3,
                            border: `1px solid ${seleccionado ? B.sky : "rgba(255,255,255,0.08)"}`,
                            background: seleccionado ? B.sky + "18" : B.navyLight,
                            color: "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: seleccionado ? 700 : 400 }}>{it.nombre}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: seleccionado ? B.sky : B.sand, flexShrink: 0 }}>
                            {COP(it.precio)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {/* Opción manual al final de cada lista */}
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 4px 4px" }}>Otros</div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, descripcion: "", valor: "" }))}
                    style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8,
                      border: `1px solid ${!menuItems.some(it => it.nombre === form.descripcion) && form.descripcion ? B.warning : "rgba(255,255,255,0.08)"}`,
                      background: !menuItems.some(it => it.nombre === form.descripcion) && form.descripcion ? B.warning + "18" : B.navyLight,
                      color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, fontStyle: "italic" }}>
                    ✏️ Ingresar descripción manual…
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Campos del servicio */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Descripción / Nombre</label>
              <Inp value={form.descripcion} onChange={v => set("descripcion", v)} placeholder="Nombre del servicio o producto" />
            </div>
            <div>
              <label style={LS}>Cantidad</label>
              <Inp type="number" value={form.cantidad ?? 1} onChange={v => set("cantidad", v)} />
            </div>
            <div>
              <label style={LS}>Precio unitario</label>
              <Inp type="number" value={form.valor} onChange={v => set("valor", v)} />
            </div>
            {(Number(form.valor) > 0 && Number(form.cantidad) > 1) && (
              <div style={{ gridColumn: "span 2", background: B.navyMid, borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Subtotal ({form.cantidad} × {COP(form.valor)})</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: B.sand }}>{COP(Number(form.valor) * Number(form.cantidad))}</span>
              </div>
            )}
            <div>
              <label style={LS}>Impuesto</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Sel value={form.tax_type || "iva"} onChange={v => set("tax_type", v)}>
                  <option value="iva">IVA</option>
                  <option value="ico">ICO</option>
                  <option value="ninguno">Sin impuesto</option>
                </Sel>
                {form.tax_type !== "ninguno" && (
                  <>
                    <Inp type="number" value={form.iva ?? 0} onChange={v => set("iva", Number(v) || 0)}
                      placeholder={form.tax_type === "ico" ? "8" : "19"} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>%</span>
                  </>
                )}
              </div>
              {form.tax_type === "iva" && (!form.iva || form.iva === 0) && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Tip: IVA estándar 19%</div>
              )}
              {form.tax_type === "ico" && (!form.iva || form.iva === 0) && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Tip: ICO licores 8%</div>
              )}
            </div>
            <div><label style={LS}>Estado</label>
              <Sel value={form.estado} onChange={v => set("estado", v)}>
                {ESTADOS_S.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Fecha</label><Inp type="date" value={form.fecha || ""} onChange={v => set("fecha", v)} /></div>
            <div><label style={LS}>Hora</label><Inp type="time" value={form.hora || ""} onChange={v => set("hora", v)} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas</label><Inp value={form.notas} onChange={v => set("notas", v)} /></div>

            {/* Resumen final con impuesto incluido */}
            {Number(form.valor) > 0 && Number(form.iva) > 0 && form.tax_type !== "ninguno" && (
              <div style={{ gridColumn: "span 2", background: B.navyMid, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  <span>Subtotal</span>
                  <span>{COP(Number(form.valor) * Number(form.cantidad || 1))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: form.tax_type === "ico" ? "#fb923c" : "#4caf50" }}>
                  <span>{(form.tax_type || "iva").toUpperCase()} {form.iva}%</span>
                  <span>+ {COP(Number(form.valor) * Number(form.cantidad || 1) * (Number(form.iva) / 100))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: B.sand, fontWeight: 800, borderTop: `1px solid ${B.navyLight}`, paddingTop: 4, marginTop: 2 }}>
                  <span>Total</span>
                  <span>{COP(Number(form.valor) * Number(form.cantidad || 1) * (1 + Number(form.iva) / 100))}</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}

      {grupoCotOpen && (
        <GrupoCotizacionModal
          evento={evento || { id: eventoId, nombre: eventoNombre, fecha: eventoFecha, categoria, precio_tipo: precioTipo }}
          pasadiasOrg={pasadiasOrg}
          servicios={items}
          pasadiasMap={pasadiasMap}
          onClose={() => setGrupoCotOpen(false)}
        />
      )}
    </div>
  );
}

// ─── PAGOS ────────────────────────────────────────────────────────────────────
const FORMAS_PAGO_GRUPO = ["Transferencia", "Efectivo", "Datafono", "Wompi", "Zelle", "Cheque"];
const EMPTY_PAGO = { id: "", monto: "", forma_pago: "Transferencia", fecha: "", notas: "", registrado_por: "", comprobante_url: "" };

function TabPagos({ pagos = [], onChange, totalGrupo = 0 }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_PAGO);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const totalPagado  = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const saldo        = totalGrupo - totalPagado;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadErr("Archivo muy grande (máx 10MB)"); return; }
    setUploading(true);
    setUploadErr("");
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `eventos/PAG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("comprobantes").upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("comprobantes").getPublicUrl(path);
      set("comprobante_url", pub.publicUrl);
    } catch (err) {
      setUploadErr("Error: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const guardar = () => {
    if (!form.monto || !form.forma_pago) return;
    const pago = { ...form, id: form.id || `PAG-${Date.now()}`, monto: Number(form.monto), fecha: form.fecha || new Date().toISOString().slice(0,10) };
    onChange([...pagos, pago]);
    setForm(EMPTY_PAGO);
    setUploadErr("");
    setShowForm(false);
  };
  const eliminar = (id) => { if (window.confirm("¿Eliminar este pago?")) onChange(pagos.filter(p => p.id !== id)); };

  const FP_COLOR = { Transferencia: B.sky, Efectivo: B.success, Datafono: "#a78bfa", Wompi: B.sand, Zelle: "#10b981", Cheque: "#f59e0b" };

  return (
    <div>
      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Total Grupo", val: totalGrupo, color: "rgba(255,255,255,0.6)" },
          { label: "Total Pagado", val: totalPagado, color: B.success },
          { label: "Saldo Pendiente", val: saldo, color: saldo > 0 ? B.danger : B.success },
        ].map(k => (
          <div key={k.label} style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: k.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(k.val)}</div>
          </div>
        ))}
      </div>

      {/* Lista de pagos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {pagos.length === 0 && !showForm && (
          <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Sin pagos registrados</div>
        )}
        {pagos.map(p => {
          const col = FP_COLOR[p.forma_pago] || "rgba(255,255,255,0.4)";
          return (
            <div key={p.id} style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: col, border: `1px solid ${col}44`, borderRadius: 20, padding: "2px 10px" }}>{p.forma_pago}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{p.fecha}</span>
                </div>
                {p.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>{p.notas}</div>}
                {p.registrado_por && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>👤 {p.registrado_por}</div>}
                {p.comprobante_url && (
                  <a href={p.comprobante_url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: B.sky, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                    📎 Ver comprobante
                  </a>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: B.success, fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{COP(p.monto)}</div>
              <button onClick={() => eliminar(p.id)} style={{ ...BTN(B.danger + "22"), padding: "3px 8px", fontSize: 11, color: B.danger, flexShrink: 0 }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* Formulario nuevo pago */}
      {showForm ? (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>Registrar Pago</div>

          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Forma de pago</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FORMAS_PAGO_GRUPO.map(fp => {
                const col = FP_COLOR[fp] || B.sky;
                const sel = form.forma_pago === fp;
                return (
                  <button key={fp} type="button" onClick={() => set("forma_pago", fp)}
                    style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${sel ? col : "rgba(255,255,255,0.12)"}`,
                      background: sel ? col + "22" : "transparent", color: sel ? col : "rgba(255,255,255,0.5)",
                      fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer" }}>
                    {fp}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Monto</label><Inp type="number" value={form.monto} onChange={v => set("monto", v)} placeholder="0" /></div>
            <div><label style={LS}>Fecha</label><Inp type="date" value={form.fecha} onChange={v => set("fecha", v)} /></div>
            <div><label style={LS}>Notas</label><Inp value={form.notas} onChange={v => set("notas", v)} placeholder="Referencia, banco..." /></div>
            <div><label style={LS}>Registrado por</label><Inp value={form.registrado_por} onChange={v => set("registrado_por", v)} /></div>
          </div>

          {/* Comprobante de pago */}
          <div style={{ marginTop: 14 }}>
            <label style={LS}>Comprobante de pago (foto/PDF)</label>
            <input type="file" accept="image/*,application/pdf" onChange={handleFile} disabled={uploading}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12 }} />
            {uploading && <div style={{ fontSize: 11, color: B.sky, marginTop: 6 }}>⏳ Subiendo…</div>}
            {uploadErr && <div style={{ fontSize: 11, color: B.danger, marginTop: 6 }}>⚠ {uploadErr}</div>}
            {form.comprobante_url && (
              <div style={{ marginTop: 8, padding: 8, background: B.navy, borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <a href={form.comprobante_url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, color: B.sky, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📎 Comprobante adjunto (click para ver)
                </a>
                <button onClick={() => set("comprobante_url", "")}
                  style={{ ...BTN(B.danger + "22"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕ Quitar</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_PAGO); setUploadErr(""); }} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={guardar} disabled={uploading} style={BTN(B.success)}>
              {uploading ? "Subiendo comprobante…" : "✓ Guardar Pago"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setShowForm(true)} style={BTN(B.success)}>+ Registrar Pago</button>
        </div>
      )}
    </div>
  );
}

// ─── MENÚS (selección de platos por servicio A&B) ────────────────────────────
const CATS_AB = ["Menú Restaurante", "Menú Bebidas", "Menú Banquetes"];
const CATS_AB_TIPO = { "Menú Restaurante": "restaurant", "Menú Bebidas": "bebidas", "Menú Banquetes": "banquetes" };

function TabMenus({ servicios, menusDetalle, onChange, cotizacionData, timelineItems = [] }) {
  // Use servicios_contratados A&B. Add rundown "servicio" blocks as synthetic services so each F&B moment across all days appears.
  // Dedupe: contracted services that are already linked to a rundown block are hidden (the block represents them)
  const linkedIds = new Set();
  (timelineItems || []).forEach(b => {
    (b.servicios_ids || []).forEach(id => linkedIds.add(id));
    if (b.servicio_contratado_id) linkedIds.add(b.servicio_contratado_id);
  });
  let abServicios = (servicios || []).filter(s => CATS_AB.includes(s.categoria) && !linkedIds.has(s.id));
  const rundownServicios = (timelineItems || [])
    .filter(b => b.tipo === "servicio")
    .map(b => ({
      id: `rb-${b.id}`,
      categoria: "Menú Banquetes",
      descripcion: b.titulo || "Servicio",
      fecha: b.fecha || "",
      hora: b.hora || "",
      ubicacion: b.ubicacion || "",
      notas: b.descripcion || "",
      _fromRundown: true,
      _blockId: b.id,
    }));
  abServicios = [...abServicios, ...rundownServicios];
  if (cotizacionData) {
    // Include virtual services from cotizacion_data alimentos only if they aren't already linked from a rundown block
    const alimentos = cotizacionData.alimentos || [];
    const cotServicios = alimentos.map((a, i) => ({
      id: `cot-alim-${i}`,
      categoria: (a.menu_tipo || "").toLowerCase().includes("banquete") ? "Menú Banquetes"
        : (a.menu_tipo || "").toLowerCase().includes("bebida") ? "Menú Bebidas"
        : "Menú Restaurante",
      descripcion: a.concepto,
      cantidad: a.cantidad || 1,
      valor: (a.cantidad || 1) * (a.valor_unit || 0) * (1 + (a.iva || 0) / 100),
      valor_unit: a.valor_unit || 0,
      _fromCotizacion: true,
    })).filter(c => !linkedIds.has(c.id));
    const withSavedPlates = cotServicios.filter(c => (menusDetalle?.[c.id]?.platos || []).length > 0);
    if (abServicios.length === 0) abServicios = [...abServicios, ...cotServicios];
    else abServicios = [...abServicios, ...withSavedPlates];
  }
  const [expanded, setExpanded]     = useState(null); // servicio id expandido
  const [catalogo, setCatalogo]     = useState([]);
  const [loadingCat, setLoadingCat] = useState(false);
  const [preview, setPreview]       = useState(false);
  const [manualText, setManualText] = useState({}); // { servId: text }
  const [manualPrice, setManualPrice] = useState({}); // { servId: price }

  // Cargar TODOS los menu_items de banquetes (para matchear por nombre y obtener opciones)
  const [menuItemsBanquetes, setMenuItemsBanquetes] = useState([]);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("menu_items").select("id, nombre, opciones, seleccion_modo, seleccion_cantidad")
      .eq("menu_tipo", "banquetes").eq("activo", true)
      .then(({ data }) => setMenuItemsBanquetes(data || []));
  }, []);

  // Para cada servicio, busca el menu_item que coincide por nombre
  const findMenuItem = (serv) => {
    const desc = (serv.descripcion || "").toLowerCase().trim();
    if (!desc) return null;
    return menuItemsBanquetes.find(m => m.nombre.toLowerCase().trim() === desc
      || desc.includes(m.nombre.toLowerCase().trim())
      || m.nombre.toLowerCase().trim().includes(desc));
  };

  // Cargar catálogo cuando se expande un servicio
  useEffect(() => {
    if (!expanded || !supabase) return;
    const serv = abServicios.find(s => s.id === expanded);
    if (!serv) return;
    const tipo = CATS_AB_TIPO[serv.categoria];
    if (!tipo) return;
    setLoadingCat(true);
    supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, tiene_iva")
      .eq("menu_tipo", tipo).eq("activo", true).order("categoria").order("orden")
      .then(({ data }) => { setCatalogo(data || []); setLoadingCat(false); });
  }, [expanded]);

  const getData = () => menusDetalle || {};
  const getPlatos = (servId) => {
    const data = getData();
    const direct = data[servId]?.platos || [];
    const serv = abServicios.find(s => s.id === servId);
    const seen = new Set(direct.map(p => p.id || p.nombre));
    const merged = [...direct];
    // For rundown-synthetic services, also pull platos from linked contracted services
    if (serv?._fromRundown) {
      const block = (timelineItems || []).find(b => b.id === serv._blockId);
      if (block) {
        const keys = [...(block.servicios_ids || []), block.servicio_contratado_id].filter(Boolean);
        keys.forEach(k => {
          (data[k]?.platos || []).forEach(p => {
            const pid = p.id || p.nombre;
            if (!seen.has(pid)) { seen.add(pid); merged.push(p); }
          });
        });
      }
    }
    // Fallback: match service by name to a banquete menu_item and use its opciones
    if (serv) {
      const mi = findMenuItem(serv);
      if (mi && Array.isArray(mi.opciones)) {
        mi.opciones.forEach((op, i) => {
          const opId = `opcion-${mi.id}-${i}`;
          const nombre = typeof op === "string" ? op : (op?.nombre || "");
          if (!nombre) return;
          if (!seen.has(opId) && !seen.has(nombre)) {
            seen.add(opId);
            merged.push({ id: opId, nombre, categoria: mi.nombre || "Opciones", cantidad: 1, precio: 0, _fromOpcion: true });
          }
        });
      }
    }
    return merged;
  };

  const togglePlato = (servId, item) => {
    const current = getPlatos(servId);
    const exists = current.find(p => p.id === item.id);
    const next = exists
      ? current.filter(p => p.id !== item.id)
      : [...current, { id: item.id, nombre: item.nombre, categoria: item.categoria, precio: item.precio, cantidad: 1, notas: "" }];
    onChange({ ...getData(), [servId]: { platos: next } });
  };

  const setCantidad = (servId, platoId, cant) => {
    const next = getPlatos(servId).map(p => p.id === platoId ? { ...p, cantidad: Number(cant) || 1 } : p);
    onChange({ ...getData(), [servId]: { platos: next } });
  };

  const setNota = (servId, platoId, notas) => {
    const next = getPlatos(servId).map(p => p.id === platoId ? { ...p, notas } : p);
    onChange({ ...getData(), [servId]: { platos: next } });
  };

  const addManualPlato = (servId) => {
    const text = (manualText[servId] || "").trim();
    if (!text) return;
    const price = Number(manualPrice[servId]) || 0;
    const current = getPlatos(servId);
    const next = [...current, { id: `manual-${Date.now()}`, nombre: text, categoria: "Manual", precio: price, cantidad: 1, notas: "", _manual: true }];
    onChange({ ...getData(), [servId]: { platos: next } });
    setManualText({ ...manualText, [servId]: "" });
    setManualPrice({ ...manualPrice, [servId]: "" });
  };

  const removePlato = (servId, platoId) => {
    const next = getPlatos(servId).filter(p => p.id !== platoId);
    onChange({ ...getData(), [servId]: { platos: next } });
  };

  // Agrupar catálogo por subcategoría
  const catPorGrupo = catalogo.reduce((acc, it) => {
    const g = it.categoria || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(it);
    return acc;
  }, {});

  // Para preview: todos los platos seleccionados agrupados por categoría
  const todosPlatos = abServicios.flatMap(s => getPlatos(s.id).map(p => ({ ...p, _servCat: s.categoria, _servDesc: s.descripcion })));
  const platosPorCat = todosPlatos.reduce((acc, p) => {
    const g = p.categoria || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(p);
    return acc;
  }, {});

  if (abServicios.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
        No hay servicios de Alimentos y Bebidas contratados.<br />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Agrega servicios de tipo "Menú Restaurante", "Menú Bebidas" o "Menú Banquetes" en el tab Servicios.</span>
      </div>
    );
  }

  // Resumen total de platos por servicio (siempre visible)
  const resumenServicios = abServicios.map(s => ({
    ...s,
    _platos: getPlatos(s.id),
  })).filter(s => s._platos.length > 0);
  const totalPlatosSeleccionados = resumenServicios.reduce((sum, s) => sum + s._platos.length, 0);

  return (
    <div>
      {/* ── Resumen siempre visible ── */}
      {totalPlatosSeleccionados > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", marginBottom: 16, border: `1px solid ${B.sand}44` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>📋 Resumen — {totalPlatosSeleccionados} platos seleccionados</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {resumenServicios.map(s => (
              <div key={s.id}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {s.descripcion || s.categoria}
                  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 6 }}>({s._platos.length})</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {s._platos.map(p => (
                    <span key={p.id} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 14, background: B.navy, color: B.white, border: `1px solid ${B.navyLight}` }}>
                      {p._manual && "✎ "}{p.nombre}{p.cantidad > 1 ? ` × ${p.cantidad}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle preview */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
        <button onClick={() => setPreview(!preview)}
          style={BTN(preview ? B.sky : B.navyLight, preview ? B.navy : "rgba(255,255,255,0.6)")}>
          {preview ? "← Editar selección" : "👁️ Vista Menú"}
        </button>
      </div>

      {/* ── MODO PREVIEW: Menú presentable por servicio ── */}
      {preview ? (
        <div style={{ background: B.navy, borderRadius: 14, padding: "28px 24px", border: `1px solid ${B.navyLight}` }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>🍽️ Menú del Evento</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Servicios de alimentos y bebidas</div>
          </div>
          {(() => {
            const serviciosConPlatos = abServicios
              .map(s => {
                const rundownBlocks = (timelineItems || []).filter(b =>
                  b.tipo === "servicio" && (
                    (b.servicios_ids || []).includes(s.id) ||
                    b.servicio_contratado_id === s.id
                  )
                ).sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")));
                const first = rundownBlocks[0];
                const sortKey = (first ? ((first.fecha||"") + (first.hora||"")) : "") || ((s.fecha||"") + (s.hora||"")) || "zzz";
                return { ...s, _platos: getPlatos(s.id), _sortKey: sortKey };
              })
              .filter(s => s._platos.length > 0 || s._fromRundown)
              .sort((a, b) => a._sortKey.localeCompare(b._sortKey));
            if (serviciosConPlatos.length === 0) {
              return <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13, padding: 20 }}>Sin platos seleccionados</div>;
            }
            return serviciosConPlatos.map(s => {
              // Find rundown blocks that reference this service
              const rundownBlocks = (timelineItems || []).filter(b =>
                b.tipo === "servicio" && (
                  (b.servicios_ids || []).includes(s.id) ||
                  b.servicio_contratado_id === s.id
                )
              ).sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")));

              return (
                <div key={s.id} style={{ marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${B.navyLight}` }}>
                  {/* Título del servicio */}
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                    {s.descripcion || s.categoria}
                  </div>

                  {/* Info del rundown: fecha, hora, ubicación */}
                  {rundownBlocks.length > 0 && (
                    <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                      {rundownBlocks.map(b => {
                        const fecha = b.fecha ? new Date(b.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "";
                        return (
                          <div key={b.id} style={{ fontSize: 12, color: "#f97316", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            {fecha && <span>📅 {fecha}</span>}
                            {b.hora && <span>🕐 {b.hora}{b.duracion ? ` (${b.duracion} min)` : ""}</span>}
                            {b.ubicacion && <span>📍 {b.ubicacion}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Info directa del servicio sintético del rundown o contratado con fecha/hora */}
                  {rundownBlocks.length === 0 && (s.fecha || s.hora || s.ubicacion) && (() => {
                    const fecha = s.fecha ? new Date(s.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "";
                    const block = s._fromRundown ? (timelineItems || []).find(b => b.id === s._blockId) : null;
                    const duracion = block?.duracion;
                    return (
                      <div style={{ marginBottom: 8, fontSize: 12, color: "#f97316", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {fecha && <span>📅 {fecha}</span>}
                        {s.hora && <span>🕐 {s.hora}{duracion ? ` (${duracion} min)` : ""}</span>}
                        {s.ubicacion && <span>📍 {s.ubicacion}</span>}
                      </div>
                    );
                  })()}

                  {/* Descripción del servicio contratado */}
                  {s.notas && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10, fontStyle: "italic", lineHeight: 1.5 }}>
                      {s.notas}
                    </div>
                  )}
                  {/* Descripción de los bloques del rundown */}
                  {rundownBlocks.length > 0 && rundownBlocks.some(b => b.descripcion) && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10, fontStyle: "italic", lineHeight: 1.5 }}>
                      {rundownBlocks.filter(b => b.descripcion).map((b, i) => (
                        <div key={i}>{b.descripcion}</div>
                      ))}
                    </div>
                  )}

                  {/* Metadatos: cantidad de pax */}
                  {s.cantidad > 1 && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                      👥 {s.cantidad} personas
                    </div>
                  )}

                  {/* Platos */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      Incluye
                    </div>
                    {s._platos.map(p => (
                      <div key={p.id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          • {p.nombre}
                          {p.cantidad > 1 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>× {p.cantidad}</span>}
                        </div>
                        {p.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic", paddingLeft: 14 }}>{p.notas}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        /* ── MODO EDICIÓN: Seleccionar platos por servicio ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {abServicios.map(s => {
            const isExp = expanded === s.id;
            const seleccionados = getPlatos(s.id);
            const selIds = new Set(seleccionados.map(p => p.id));
            // Find rundown blocks that reference this service
            const rundownBlocks = (timelineItems || []).filter(b =>
              b.tipo === "servicio" && (
                (b.servicios_ids || []).includes(s.id) ||
                b.servicio_contratado_id === s.id
              )
            ).sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||"")));
            return (
              <div key={s.id} style={{ background: B.navy, borderRadius: 12, overflow: "hidden", border: `1px solid ${isExp ? B.sky + "44" : B.navyLight}` }}>
                {/* Header del servicio */}
                <div onClick={() => setExpanded(isExp ? null : s.id)}
                  style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.descripcion || s.categoria}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {s.categoria} · {s.cantidad > 1 ? `${s.cantidad} pax` : ""} {s.valor > 0 ? `· ${COP(s.valor)}` : ""}
                    </div>
                    {/* Momentos del rundown donde se ofrece */}
                    {rundownBlocks.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                        {rundownBlocks.map(b => {
                          const fecha = b.fecha ? new Date(b.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "";
                          return (
                            <div key={b.id} style={{ fontSize: 11, color: "#f97316", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ padding: "1px 8px", borderRadius: 4, background: "#f97316" + "22", fontWeight: 700, fontSize: 10 }}>📋 Rundown</span>
                              {fecha && <span>{fecha}</span>}
                              {b.hora && <span>🕐 {b.hora}</span>}
                              {b.titulo && <span style={{ color: "rgba(255,255,255,0.6)" }}>· {b.titulo}</span>}
                              {b.ubicacion && <span>📍 {b.ubicacion}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {rundownBlocks.length === 0 && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6, fontStyle: "italic" }}>
                        ⚠ No está asignado a ningún bloque del Rundown
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {seleccionados.length > 0 && (
                      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, background: B.success + "22", color: B.success, fontWeight: 700 }}>
                        {seleccionados.length} platos
                      </span>
                    )}
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Sección expandida — solo manual */}
                {isExp && (
                  <div style={{ borderTop: `1px solid ${B.navyLight}`, padding: "14px 18px" }}>
                    <div>
                        {/* Platos seleccionados primero */}
                        {seleccionados.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 10, color: B.success, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>✓ Seleccionados ({seleccionados.length})</div>
                            {seleccionados.map(p => (
                              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: B.success + "0a", borderRadius: 8, marginBottom: 4, border: `1px solid ${B.success}22` }}>
                                <button onClick={() => removePlato(s.id, p.id)} title="Quitar" style={{ background: B.success, border: "none", borderRadius: 4, color: "#fff", width: 22, height: 22, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✓</button>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p._manual && "✎ "}{p.nombre}</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{p.categoria}</div>
                                </div>
                                <input value={p.notas || ""} onChange={e => setNota(s.id, p.id, e.target.value)}
                                  placeholder="Nota..." style={{ width: 140, ...IS, padding: "4px 8px", fontSize: 11 }} />
                                <button onClick={() => removePlato(s.id, p.id)} title="Eliminar" style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 4, color: B.danger, width: 22, height: 22, fontSize: 11, cursor: "pointer", flexShrink: 0, fontWeight: 700 }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Opciones predefinidas del menú (si coincide con un menu_item de banquetes) */}
                        {(() => {
                          const mi = findMenuItem(s);
                          if (!mi || !mi.opciones || mi.opciones.length === 0) return null;
                          const selectedNames = new Set(seleccionados.map(p => p.nombre));
                          const seleccionados_count = mi.opciones.filter(op => selectedNames.has(op)).length;
                          return (
                            <div style={{ marginBottom: 14, padding: "12px 14px", background: "#f97316" + "08", border: `1px solid ${"#f97316"}44`, borderRadius: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  📋 Opciones del menú "{mi.nombre}"
                                </div>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: mi.seleccion_modo === "todo" ? B.success + "22" : B.warning + "22", color: mi.seleccion_modo === "todo" ? B.success : B.warning, fontWeight: 700 }}>
                                  {mi.seleccion_modo === "todo" ? "✓ Incluye todo" : `☑ Elegir ${mi.seleccion_cantidad || "?"}`}
                                </span>
                              </div>
                              {mi.seleccion_modo === "seleccion" && (
                                <div style={{ fontSize: 11, color: seleccionados_count === (mi.seleccion_cantidad || 0) ? B.success : seleccionados_count > (mi.seleccion_cantidad || 0) ? B.danger : "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                                  {seleccionados_count} de {mi.seleccion_cantidad} seleccionadas
                                  {seleccionados_count > (mi.seleccion_cantidad || 0) && " ⚠ excede el límite"}
                                </div>
                              )}
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {mi.opciones.map((op, i) => {
                                  const isSel = selectedNames.has(op);
                                  return (
                                    <div key={i} onClick={() => {
                                      if (isSel) {
                                        const plato = seleccionados.find(p => p.nombre === op);
                                        if (plato) removePlato(s.id, plato.id);
                                      } else {
                                        if (mi.seleccion_modo === "todo") {
                                          // auto-add all at once? No, let user click each
                                        }
                                        const current = getPlatos(s.id);
                                        const next = [...current, { id: `opcion-${Date.now()}-${i}`, nombre: op, categoria: mi.nombre, precio: 0, cantidad: 1, notas: "", _fromOpcion: true }];
                                        onChange({ ...getData(), [s.id]: { platos: next } });
                                      }
                                    }}
                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer",
                                        background: isSel ? "#f97316" + "15" : "transparent", borderRadius: 6, border: `1px solid ${isSel ? "#f97316" + "44" : "transparent"}` }}>
                                      <div style={{ width: 18, height: 18, borderRadius: 4, border: isSel ? "none" : "2px solid rgba(255,255,255,0.2)",
                                        background: isSel ? "#f97316" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                                        color: "#fff", fontSize: 11, flexShrink: 0 }}>{isSel && "✓"}</div>
                                      <span style={{ fontSize: 12, color: isSel ? "#fff" : "rgba(255,255,255,0.6)", fontWeight: isSel ? 700 : 400 }}>{op}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {mi.seleccion_modo === "todo" && seleccionados_count < mi.opciones.length && (
                                <button onClick={() => {
                                  const current = getPlatos(s.id);
                                  const currentNames = new Set(current.map(p => p.nombre));
                                  const toAdd = mi.opciones.filter(op => !currentNames.has(op)).map((op, i) => ({
                                    id: `opcion-${Date.now()}-${i}`, nombre: op, categoria: mi.nombre, precio: 0, cantidad: 1, notas: "", _fromOpcion: true,
                                  }));
                                  onChange({ ...getData(), [s.id]: { platos: [...current, ...toAdd] } });
                                }}
                                  style={{ marginTop: 8, width: "100%", padding: "8px", background: B.success + "22", border: `1px solid ${B.success}44`, borderRadius: 6, color: B.success, fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                                  + Agregar todas las opciones
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        {/* Agregar plato manual */}
                        <div style={{ marginBottom: 14, padding: "10px 12px", background: B.sand + "0a", border: `1px dashed ${B.sand}44`, borderRadius: 8 }}>
                          <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>✎ Agregar plato manual</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input value={manualText[s.id] || ""}
                              onChange={e => setManualText({ ...manualText, [s.id]: e.target.value })}
                              onKeyDown={e => { if (e.key === "Enter") addManualPlato(s.id); }}
                              placeholder="Nombre del plato..."
                              style={{ flex: 1, ...IS, padding: "6px 10px", fontSize: 12 }} />
                            <button onClick={() => addManualPlato(s.id)}
                              style={{ background: B.sand, border: "none", borderRadius: 6, color: B.navy, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>+ Agregar</button>
                          </div>
                        </div>
                      </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ASIGNACIONES (vista por persona) ─────────────────────────────────────────
function TabAsignaciones({ timelineItems = [] }) {
  // Aggregate by person
  const byPerson = {};
  const ensure = (nombre) => {
    if (!byPerson[nombre]) byPerson[nombre] = { nombre, bloques: [], tareas: [] };
    return byPerson[nombre];
  };

  (timelineItems || []).forEach(b => {
    const resp = b.responsable === "__otro" ? (b.responsable_otro || "Sin asignar") : (b.responsable || "");
    if (resp && resp !== "Sin asignar") {
      ensure(resp).bloques.push(b);
    }
    (b.tareas || []).forEach(t => {
      if (t.asignado) ensure(t.asignado).tareas.push({ ...t, _bloque: b });
    });
  });

  const personas = Object.values(byPerson).sort((a, b) => (b.bloques.length + b.tareas.length) - (a.bloques.length + a.tareas.length));

  if (personas.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
        Sin asignaciones registradas.<br />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Asigna encargados o tareas en los bloques del Rundown para verlos aquí.</span>
      </div>
    );
  }

  const tipoColorLocal = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.color || B.sky;
  const tipoLabelLocal = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.label || t;

  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
        {personas.length} {personas.length === 1 ? "persona asignada" : "personas asignadas"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {personas.map(p => {
          const pendientes = p.tareas.filter(t => !t.completada).length;
          return (
            <div key={p.nombre} style={{ background: B.navyMid, borderRadius: 12, padding: 18, border: `1px solid ${B.navyLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${B.navyLight}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: B.sky + "22", color: B.sky, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
                    {p.nombre.split(" ").map(n => n[0]).slice(0,2).join("")}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {p.bloques.length} bloque{p.bloques.length !== 1 ? "s" : ""} · {p.tareas.length} tarea{p.tareas.length !== 1 ? "s" : ""}
                      {pendientes > 0 && <span style={{ color: B.warning, marginLeft: 6 }}>· {pendientes} pendiente{pendientes !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloques */}
              {p.bloques.length > 0 && (
                <div style={{ marginBottom: p.tareas.length > 0 ? 14 : 0 }}>
                  <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Bloques asignados</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[...p.bloques].sort((a, b) => ((a.fecha||"")+(a.hora||"")).localeCompare((b.fecha||"")+(b.hora||""))).map(b => {
                      const c = tipoColorLocal(b.tipo);
                      return (
                        <div key={b.id} style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${c}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{b.titulo}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                              <span style={{ color: c }}>{tipoLabelLocal(b.tipo)}</span>
                              {b.fecha && <span> · {new Date(b.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>}
                              {b.hora && <span> · 🕐 {b.hora}</span>}
                              {b.ubicacion && <span> · 📍 {b.ubicacion}</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: ESTADOS_TL.find(x => x.key === b.estado)?.color + "22" || "rgba(255,255,255,0.1)", color: ESTADOS_TL.find(x => x.key === b.estado)?.color || "rgba(255,255,255,0.5)", fontWeight: 700 }}>
                            {ESTADOS_TL.find(x => x.key === b.estado)?.label || b.estado}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tareas */}
              {p.tareas.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Tareas asignadas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {p.tareas.map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: B.navy, borderRadius: 6, fontSize: 12 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, background: t.completada ? B.success : "transparent",
                          border: t.completada ? "none" : "1.5px solid rgba(255,255,255,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, flexShrink: 0 }}>
                          {t.completada && "✓"}
                        </div>
                        <span style={{ flex: 1, color: t.completada ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)", textDecoration: t.completada ? "line-through" : "none" }}>{t.texto}</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{t._bloque?.titulo || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function EventoDetalle({ evento: inicial, canEdit = true, onBack, onEdit, onSaved }) {
  const isMobile = useMobile();
  const [tab, setTab] = useState("rundown");
  const [evento, setEvento] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const [modoStaff, setModoStaff] = useState(false);
  const [pasadiasMap, setPasadiasMap] = useState({});
  const [usuariosList, setUsuariosList] = useState([]);
  const [currentUser, setCurrentUser]   = useState("");
  const [vistaOperativa, setVistaOperativa] = useState(false);
  const [puedeVerPL, setPuedeVerPL] = useState(false);

  // Load current user name + rol para history logging y vista restringida.
  // "Vista operativa" = roles operativos (cocina, etc.) que solo necesitan
  // ver Rundown, Menús, Servicios (sin precios), Asignaciones y Dietas.
  // "Puede ver P/L" = solo super_admin, admin, gerente_general_*, contabilidad
  // o usuarios con permisos_extra.eventos_pl. Es el resumen financiero
  // confidencial: cotizado vs costos reales (consumo + flota + extras) =
  // margen del evento.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data } = await supabase.from("usuarios")
        .select("nombre, rol_id, permisos_extra, email")
        .eq("email", session.user.email.toLowerCase()).single();
      setCurrentUser(data?.nombre || session.user.email);
      const rid = (data?.rol_id || "").toLowerCase();
      const email = (data?.email || "").toLowerCase();
      const extras = Array.isArray(data?.permisos_extra) ? data.permisos_extra : [];
      const esOperativo = /^(chef|cocina|maitre|capitan_servicio|operativo)/.test(rid)
        || extras.includes("eventos_vista_operativa");
      setVistaOperativa(esOperativo);
      // P/L: super_admin, admin, gerente_general_*, contabilidad o el dueño Eric
      const puedePL = ["super_admin", "admin", "contabilidad"].includes(rid)
        || rid.startsWith("gerente_general")
        || extras.includes("eventos_pl")
        || email === "erickern1@gmail.com" || email === "eric@atoloncartagena.com";
      setPuedeVerPL(puedePL);
    });
  }, []);
  const saveTimer = useRef(null);
  const logTimer  = useRef(null);

  // Reload fresh data on mount
  useEffect(() => {
    if (!supabase || !inicial?.id) return;
    supabase.from("eventos").select("*").eq("id", inicial.id).single()
      .then(({ data }) => { if (data) setEvento(prev => ({ ...prev, ...data })); });
  }, [inicial?.id]);

  // Cargar usuarios para dropdown de encargados
  useEffect(() => {
    if (!supabase) return;
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setUsuariosList(data || []));
  }, []);

  // Cargar precios de pasadías para lookup en tab Servicios
  useEffect(() => {
    if (!supabase) return;
    supabase.from("pasadias").select("nombre, precio, precio_neto_agencia, precio_nino, precio_neto_nino, descripcion, incluye")
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(p => { map[p.nombre.toLowerCase()] = p; });
        setPasadiasMap(map);
      });
  }, []);

  // B2B: cargar aliado nombre y calcular comisión
  const [aliadoNombre, setAliadoNombre] = useState("");
  const [comisionB2B, setComisionB2B]   = useState(0);
  useEffect(() => {
    if (!supabase || !evento?.aliado_id) return;
    // Aliado name
    supabase.from("aliados_b2b").select("nombre").eq("id", evento.aliado_id).single()
      .then(({ data }) => { if (data) setAliadoNombre(data.nombre); });
    // Convenios for comision calc
    supabase.from("b2b_convenios").select("tipo_pasadia, tarifa_publica, tarifa_neta, tarifa_publica_nino, tarifa_neta_nino")
      .eq("aliado_id", evento.aliado_id).eq("activo", true)
      .then(({ data }) => {
        if (!data || !evento.pasadias_org?.length) return;
        const convMap = {};
        data.forEach(c => { convMap[c.tipo_pasadia.toLowerCase()] = c; });
        let total = 0;
        (evento.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").forEach(p => {
          const conv = convMap[p.tipo.toLowerCase()];
          if (!conv) return;
          const adultos = Number(p.adultos) || 0;
          const ninos   = Number(p.ninos)   || 0;
          const personas = Number(p.personas) || 0;
          if (adultos > 0 || ninos > 0) {
            total += (conv.tarifa_publica - conv.tarifa_neta) * adultos;
            if (conv.tarifa_publica_nino && conv.tarifa_neta_nino) {
              total += (conv.tarifa_publica_nino - conv.tarifa_neta_nino) * ninos;
            }
          } else {
            total += (conv.tarifa_publica - conv.tarifa_neta) * personas;
          }
        });
        setComisionB2B(Math.max(0, total));
      });
  }, [evento?.aliado_id, evento?.pasadias_org]);

  const saveField = useCallback(async (field, value) => {
    if (!supabase || !evento?.id) return;
    setSaving(true);
    await supabase.from("eventos").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", evento.id);
    setSaving(false);
    onSaved?.();
  }, [evento?.id, onSaved]);

  // Auto-log changes to historial_cambios
  const logCambio = (field, prevValue, newValue) => {
    if (field === "historial_cambios") return; // don't log the log itself
    const FIELD_LABELS = {
      timeline_items: "Rundown",
      servicios_contratados: "Servicios contratados",
      menus_detalle: "Menús",
      transporte_detalle: "Transporte",
      embarcaciones_evento: "Embarcaciones del evento",
      contactos_rapidos: "Contactos",
      restricciones_dieteticas: "Dietas",
      incidentes: "Bitácora",
      notas_operativas: "Notas operativas",
      pasadias_org: "Pasadías del grupo",
      cotizacion_data: "Cotización",
      nombre: "Nombre",
      fecha: "Fecha",
      fecha_fin: "Fecha fin",
      hora_ini: "Hora de inicio",
      hora_fin: "Hora de término",
      pax: "Pax",
      valor: "Valor",
      stage: "Etapa",
      contacto: "Contacto",
      empresa: "Empresa",
      tel: "Teléfono",
      email: "Email",
      nit: "NIT",
      direccion: "Dirección",
      nacionalidad: "Nacionalidad",
      montaje: "Montaje",
      vendedor: "Vendedor",
      responsable_evento: "Responsable",
      notas: "Notas",
    };
    // Describe what changed
    let accion = "modificó";
    let descripcion = FIELD_LABELS[field] || field;
    let antes = null;
    let despues = null;
    const isScalar = (v) => v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
    if (isScalar(prevValue) && isScalar(newValue)) {
      const prevStr = prevValue == null || prevValue === "" ? "—" : String(prevValue);
      const newStr = newValue == null || newValue === "" ? "—" : String(newValue);
      if (prevStr === newStr) return; // no real change
      antes = prevStr;
      despues = newStr;
      descripcion = FIELD_LABELS[field] || field;
    } else if (Array.isArray(prevValue) && Array.isArray(newValue)) {
      if (newValue.length > prevValue.length) {
        accion = "agregó";
        // Find the new item
        const added = newValue.find(n => !prevValue.find(p => p.id === n.id));
        if (added) {
          if (field === "timeline_items") {
            descripcion = `bloque "${added.titulo || added.tipo}" al rundown`;
          } else if (field === "servicios_contratados") {
            descripcion = `servicio "${added.descripcion || added.categoria}"`;
          } else if (field === "transporte_detalle") {
            descripcion = `transporte "${added.embarcacion || added.tipo}"`;
          } else if (field === "embarcaciones_evento") {
            descripcion = `embarcación "${added.nombre}"`;
          } else if (field === "contactos_rapidos") {
            descripcion = `contacto "${added.nombre || added.rol}"`;
          } else if (field === "incidentes") {
            descripcion = `novedad "${added.descripcion || ""}"`;
          } else {
            descripcion = `ítem en ${FIELD_LABELS[field] || field}`;
          }
        }
      } else if (newValue.length < prevValue.length) {
        accion = "eliminó";
        const removed = prevValue.find(p => !newValue.find(n => n.id === p.id));
        if (removed) {
          if (field === "timeline_items") {
            descripcion = `bloque "${removed.titulo || removed.tipo}" del rundown`;
          } else {
            descripcion = `ítem de ${FIELD_LABELS[field] || field}`;
          }
        }
      } else {
        accion = "actualizó";
        // Check if a task was added/modified within a timeline item
        if (field === "timeline_items") {
          for (let i = 0; i < newValue.length; i++) {
            const nT = (newValue[i].tareas || []).length;
            const pT = (prevValue[i]?.tareas || []).length;
            if (nT > pT) { accion = "agregó"; descripcion = `tarea al bloque "${newValue[i].titulo || ""}"`; break; }
            if (nT < pT) { accion = "eliminó"; descripcion = `tarea del bloque "${newValue[i].titulo || ""}"`; break; }
          }
        }
      }
    }
    const entry = {
      id: uid(),
      timestamp: new Date().toISOString(),
      usuario: currentUser || "—",
      accion,
      descripcion,
      campo: field,
      antes,
      despues,
    };
    setEvento(prev => {
      const historial = [entry, ...(prev.historial_cambios || [])].slice(0, 500); // cap at 500 entries
      return { ...prev, historial_cambios: historial };
    });
    // Save historial asynchronously (without triggering another log)
    if (supabase && evento?.id) {
      clearTimeout(logTimer.current);
      logTimer.current = setTimeout(() => {
        supabase.from("eventos").select("historial_cambios").eq("id", evento.id).single().then(({ data }) => {
          const existing = data?.historial_cambios || [];
          const newHist = [entry, ...existing].slice(0, 500);
          supabase.from("eventos").update({ historial_cambios: newHist }).eq("id", evento.id);
        });
      }, 1200);
    }
  };

  const updateLocal = (field, value) => {
    if (!canEdit) return; // read-only users can't update
    const prevValue = evento[field];
    setEvento(prev => ({ ...prev, [field]: value }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveField(field, value), 800);
    // Log the change
    if (JSON.stringify(prevValue) !== JSON.stringify(value)) {
      logCambio(field, prevValue, value);
    }
  };

  const stageColors = { Consulta: B.warning, Cotizado: B.sky, Confirmado: B.success, Realizado: "rgba(255,255,255,0.3)" };
  const stageColor = stageColors[evento.stage] || B.sand;

  const esGrupo = evento.categoria === "grupo";
  // Vista operativa (cocina/maitre): solo lectura + sin pestañas de
  // pagos / contactos / bitácora / contratistas / transporte / BEO.
  // En Servicios se ocultan precios.
  const efectivoCanEdit = canEdit && !vistaOperativa;
  const TABS_FULL = [
    { key: "rundown",     label: isMobile ? "📋" : "📋 Rundown" },
    { key: "servicios",   label: isMobile ? "🛎" : "🛎 Servicios" },
    { key: "menus",       label: isMobile ? "🍽️" : "🍽️ Menús" },
    { key: "openbar",     label: isMobile ? "🍾" : "🍾 Consumo" },
    { key: "gastos",      label: isMobile ? "🧾" : "🧾 Gastos servicios" },
    { key: "asignaciones",label: isMobile ? "👥" : "👥 Asignaciones" },
    { key: "pagos", label: isMobile ? "💳" : "💳 Pagos" },
    { key: "transporte",  label: isMobile ? "⛵" : "⛵ Transporte" },
    { key: "contactos",   label: isMobile ? "👤" : "👤 Contactos" },
    { key: "contratistas",label: isMobile ? "🤝" : "🤝 Contratistas" },
    { key: "dietas",      label: isMobile ? "🍽" : "🍽 Dietas" },
    { key: "beo",         label: isMobile ? "📋" : "📋 BEO" },
    { key: "bitacora",    label: isMobile ? "📝" : "📝 Bitácora" },
    // Solo visible para super_admin, admin, gerente_general_*, contabilidad
    // Comparativo cotizado vs costos reales (consumo + flota + extras).
    ...(puedeVerPL ? [{ key: "pl", label: isMobile ? "💰" : "💰 P/L", restricted: true }] : []),
  ];
  const TABS_OPERATIVA = TABS_FULL.filter(t =>
    ["rundown", "servicios", "menus", "openbar", "asignaciones", "dietas"].includes(t.key)
  );
  const TABS = vistaOperativa ? TABS_OPERATIVA : TABS_FULL;
  // Si el tab actual no está disponible en la vista operativa (ej: usuario
  // navegó a "pagos" antes), mover a rundown automáticamente.
  useEffect(() => {
    if (vistaOperativa && !TABS.some(t => t.key === tab)) setTab("rundown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaOperativa, tab]);

  // Contar alertas
  const incidentesAbiertos = (evento.incidentes||[]).filter(x => !x.resuelto && x.prioridad === "critico").length;
  const alergias = (evento.restricciones_dieteticas||[]).filter(x => (x.alergias||[]).length > 0).length;

  if (modoStaff) {
    const staffLink = `${window.location.origin}/staff/${evento.id}`;
    const copyStaffLink = async () => {
      try {
        await navigator.clipboard.writeText(staffLink);
        alert(`✓ Enlace copiado:\n${staffLink}\n\nCompártelo con el equipo. Es solo lectura.`);
      } catch {
        prompt("Copia el enlace:", staffLink);
      }
    };
    return (
      <div style={{ background: B.navy, minHeight: "100vh", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{evento.nombre}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={copyStaffLink}
              style={{ ...BTN(B.sand + "22"), border: `1px solid ${B.sand}55`, color: B.sand, fontSize: 11, padding: "6px 10px" }}
              title="Copiar enlace solo lectura para compartir">
              🔗 Compartir
            </button>
            <button onClick={() => setModoStaff(false)} style={{ ...BTN(B.navyMid), border: `1px solid ${B.navyLight}`, fontSize: 12 }}>← Vista completa</button>
          </div>
        </div>
        <ModoStaff evento={evento} timeline={evento.timeline_items||[]} contactos={evento.contactos_rapidos||[]}
          transporte={evento.transporte_detalle||[]} incidentes={evento.incidentes||[]}
          onUpdateTimeline={v => updateLocal("timeline_items", v)} />
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ ...BTN(B.navyMid), border: `1px solid ${B.navyLight}`, fontSize: 12, flexShrink: 0, marginTop: 2 }}>← Volver</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, fontFamily: "'Barlow Condensed', sans-serif" }}>{evento.nombre}</h2>
            <span style={{ background: stageColor + "22", color: stageColor, border: `1px solid ${stageColor}44`,
              borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{evento.stage}</span>
            {incidentesAbiertos > 0 && <span style={{ background: B.danger + "33", color: B.danger, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800 }}>🚨 {incidentesAbiertos} crítico{incidentesAbiertos > 1 ? "s" : ""}</span>}
            {alergias > 0 && <span style={{ background: B.danger + "22", color: B.danger, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>⚠ {alergias} alergia{alergias > 1 ? "s" : ""}</span>}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
            {evento.tipo} · {evento.fecha_fin && evento.fecha_fin !== evento.fecha ? `${fmtFecha(evento.fecha)} → ${fmtFecha(evento.fecha_fin)}` : fmtFecha(evento.fecha)}
            {evento.hora_ini && ` · ${evento.hora_ini}`}{evento.hora_fin && `–${evento.hora_fin}`}
            {" · "}{evento.pax} pax
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => setModoStaff(true)} style={{ ...BTN("#1a3d2a"), border: `1px solid ${B.success}44`, color: B.success, fontSize: 12 }}>📱 Modo Staff</button>
          {canEdit && <button onClick={onEdit} style={{ ...BTN(B.navyMid), border: `1px solid ${B.navyLight}`, fontSize: 12 }}>✏ Editar datos</button>}
          {!canEdit && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.sand + "22", color: B.sand, fontWeight: 700 }}>👁 Solo lectura</span>}
          {saving && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>Guardando…</span>}
        </div>
      </div>

      {/* Hero info bar */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 20px", marginBottom: 20,
        display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
        {[
          { label: "Cliente", val: evento.contacto || "—" },
          { label: "Teléfono", val: evento.tel || "—" },
          { label: "Tipo", val: evento.tipo || "—" },
          { label: "Valor", val: COP(evento.valor) },
          { label: "Responsable", val: evento.responsable_evento || evento.vendedor || "—" },
          { label: "Montaje desde", val: evento.montaje || "—" },
          ...(aliadoNombre ? [{ label: "B2B", val: aliadoNombre, color: B.sky }] : []),
          ...(comisionB2B > 0 ? [{ label: "Comisión B2B", val: COP(comisionB2B), color: B.warning }] : []),
        ].map(f => (
          <div key={f.label}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.label}</div>
            <div style={{ fontWeight: 700, color: f.color || B.white }}>{f.val}</div>
          </div>
        ))}
      </div>

      {/* Notas operativas */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ ...LS, fontSize: 12 }}>📌 Notas operativas</label>
        <textarea value={evento.notas_operativas || ""} rows={2}
          onChange={e => updateLocal("notas_operativas", e.target.value)}
          placeholder="Instrucciones especiales, requerimientos del cliente, notas del día…"
          style={{ ...IS, resize: "vertical" }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", color: tab === t.key ? "#fff" : "rgba(255,255,255,0.4)",
            borderRadius: "8px 8px 0 0", padding: "9px 16px", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: tab === t.key ? `3px solid ${B.sky}` : "3px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "rundown"   && (() => {
        let sAB = (evento.servicios_contratados||[]).filter(s => ["Menú Restaurante","Menú Bebidas","Menú Banquetes"].includes(s.categoria));
        if (sAB.length === 0 && evento.cotizacion_data?.alimentos?.length > 0) {
          sAB = evento.cotizacion_data.alimentos.map((a, i) => ({
            id: `cot-alim-${i}`, categoria: "Menú Banquetes", descripcion: a.concepto,
            cantidad: a.cantidad || 1, valor: (a.cantidad||1) * (a.valor_unit||0) * (1 + (a.iva||0)/100),
          }));
        }
        return <TabTimeline items={evento.timeline_items||[]} onChange={v => updateLocal("timeline_items", v)} transportes={evento.transporte_detalle||[]} usuarios={usuariosList} serviciosAB={sAB} embarcacionesEvento={evento.embarcaciones_evento||[]} evento={evento} readOnly={!efectivoCanEdit} />;
      })()}
      {tab === "servicios" && <TabServicios  items={evento.servicios_contratados||[]}     onChange={v => updateLocal("servicios_contratados", v)} pasadiasOrg={evento.pasadias_org||[]} onChangePasadias={vistaOperativa ? null : v => updateLocal("pasadias_org", v)} categoria={evento.categoria} precioTipo={evento.precio_tipo||"publico"} pasadiasMap={pasadiasMap} cotizacionData={evento.cotizacion_data||null} eventoId={evento.id} eventoFecha={evento.fecha} eventoNombre={evento.nombre} evento={evento} ocultarPrecios={vistaOperativa} />}
      {tab === "menus"     && <TabMenus     servicios={evento.servicios_contratados||[]} menusDetalle={evento.menus_detalle||{}} onChange={v => updateLocal("menus_detalle", v)} cotizacionData={evento.cotizacion_data||null} timelineItems={evento.timeline_items||[]} />}
      {tab === "openbar"   && <TabOpenBar      evento={evento} ocultarPrecios={vistaOperativa} />}
      {tab === "gastos"    && <TabGastosServicios evento={evento} ocultarPrecios={vistaOperativa} />}
      {tab === "asignaciones" && <TabAsignaciones timelineItems={evento.timeline_items||[]} />}
      {tab === "pagos"     && (() => {
        const resolverPrecioLocal = (p) => {
          if (Number(p.precio_manual) > 0) return Number(p.precio_manual);
          const match = pasadiasMap[(p.tipo || "").toLowerCase()];
          return match ? (match.precio || 0) : 0;
        };
        const resolverPrecioNinoLocal = (p) => {
          const match = pasadiasMap[(p.tipo || "").toLowerCase()];
          return match ? (match.precio_nino || 0) : 0;
        };
        const subtotalLineaLocal = (p) => {
          if (p.cortesia) return 0;
          const adultos = Number(p.adultos) || 0;
          const ninos   = Number(p.ninos)   || 0;
          if (adultos > 0 || ninos > 0) {
            return resolverPrecioLocal(p) * adultos + resolverPrecioNinoLocal(p) * ninos;
          }
          return resolverPrecioLocal(p) * (Number(p.personas) || 0);
        };
        const totalCompras   = (evento.pasadias_org||[]).reduce((s, p) => s + subtotalLineaLocal(p), 0);
        const totalServicios = (evento.servicios_contratados||[]).reduce((s, x) => s + (Number(x.valor)||0), 0);
        const base           = evento.valor > 0 ? evento.valor : totalCompras;
        const totalGrupo     = base + (Number(evento.valor_extras)||0) + totalServicios;
        return <TabPagos pagos={evento.pagos||[]} onChange={v => updateLocal("pagos", v)} totalGrupo={totalGrupo} />;
      })()}
      {tab === "transporte"&& <TabTransporte items={evento.transporte_detalle||[]} onChange={v => updateLocal("transporte_detalle", v)} embarcacionesEvento={evento.embarcaciones_evento||[]} onChangeEmbarcaciones={v => updateLocal("embarcaciones_evento", v)} timelineItems={evento.timeline_items||[]} evento={evento} updateLocal={updateLocal} />}
      {tab === "contactos" && <TabContactos  items={evento.contactos_rapidos||[]}         onChange={v => updateLocal("contactos_rapidos", v)} />}
      {tab === "contratistas" && <TabContratistas items={evento.contratistas||[]}         onChange={v => updateLocal("contratistas", v)} eventoId={evento.id} evento={evento} />}
      {tab === "dietas"    && <TabDietas     items={evento.restricciones_dieteticas||[]}  paxTotal={evento.pax||0} onChange={v => updateLocal("restricciones_dieteticas", v)} />}
      {tab === "beo"       && <TabBEO        evento={evento} notas={evento.beo_notas||{}} onChange={v => updateLocal("beo_notas", v)} readOnly={!canEdit} />}
      {tab === "bitacora"  && <TabBitacora   items={evento.incidentes||[]}               onChange={v => updateLocal("incidentes", v)} historial={evento.historial_cambios||[]} />}
      {tab === "pl" && puedeVerPL && <TabPL  evento={evento} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TabOpenBar — Registro de consumo del evento (3 tipos):
//   • openbar         — Bebidas del open bar (servicio)
//   • cocina_buffet   — Productos del buffet (cocina)
//   • cocina_paquete  — Productos incluidos en el paquete (cocina)
//
// Cada registro descuenta del stock (vía trigger DB) y suma al costo
// total del evento. Snapshot del precio de compra al momento del
// registro → costo histórico fijo aunque suba el precio después.
// ─────────────────────────────────────────────────────────────────────
const TIPOS_CONSUMO = [
  { k: "openbar",        l: "Open Bar",        icon: "🍾", color: "#a78bfa", desc: "Bebidas servidas en barra" },
  { k: "cocina_buffet",  l: "Buffet",          icon: "🍽️", color: "#f59e0b", desc: "Productos del buffet" },
  { k: "cocina_paquete", l: "Paquete incluido", icon: "🎁", color: "#22c55e", desc: "Productos del paquete contratado" },
];

function TabOpenBar({ evento, ocultarPrecios = false }) {
  const eventoId = evento?.id;
  const [items, setItems] = useState([]);
  const [locaciones, setLocaciones] = useState([]);
  const [consumo, setConsumo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("todos"); // todos | openbar | cocina_buffet | cocina_paquete
  const [showPick, setShowPick] = useState(false);
  const [search, setSearch] = useState("");
  const [pickItem, setPickItem] = useState(null);
  const [pickTipo, setPickTipo] = useState("openbar");
  const [pickServicio, setPickServicio] = useState("");  // formato: "origen|id"
  const [cantidad, setCantidad] = useState("1");
  const [locacionId, setLocacionId] = useState("LOC-EVENTOS");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  // Carrito de productos antes de guardar (permite agregar varios sin
  // cerrar el modal — al final se guardan todos juntos)
  const [carrito, setCarrito] = useState([]);
  // Vista por servicio: expandir/colapsar y modo agrupado vs lista plana
  const [vistaAgrupada, setVistaAgrupada] = useState(true);
  const [servicioAbierto, setServicioAbierto] = useState({});  // { key: bool }
  const toggleServicio = (key) => setServicioAbierto(s => ({ ...s, [key]: !s[key] }));
  const COPx = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
  const tipoInfo = (k) => TIPOS_CONSUMO.find(t => t.k === k) || TIPOS_CONSUMO[0];

  // ── Servicios de A&B disponibles para vincular ──────────────────────
  // Solo extraemos items relacionados con Alimentos & Bebidas:
  //   • cotizacion_data.alimentos[]                    → "Cotizado A&B"
  //   • extras_data.alimentos[]                        → "Extra A&B"
  //   • servicios_contratados[] con categoría A&B      → "Servicio contratado"
  //     (banquetes, bebidas, restaurant, alimentos, alimentos y bebidas)
  const serviciosAyB = useMemo(() => {
    const result = [];
    const cot = evento?.cotizacion_data || {};
    const extras = evento?.extras_data || {};

    (cot.alimentos || []).forEach(a => {
      if (!a) return;
      result.push({
        id: a.id || `alim-${result.length}`,
        origen: "alimento",
        origenLabel: "Cotizado A&B",
        origenColor: "#f59e0b",
        descripcion: a.concepto || a.descripcion || "Sin nombre",
        cantidad: a.cantidad,
      });
    });
    (extras.alimentos || []).forEach((a, i) => {
      if (!a) return;
      result.push({
        id: a.id || `extra-alim-${i}`,
        origen: "extra_alimento",
        origenLabel: "Extra A&B",
        origenColor: "#fb923c",
        descripcion: a.concepto || a.descripcion || "Sin nombre",
        cantidad: a.cantidad,
      });
    });
    const CATS_AYB = /banquete|bebida|restaurant|alimento|comida|menu|cocktail|coctel|food|catering/i;
    (evento?.servicios_contratados || []).forEach(s => {
      if (!s) return;
      const cat = String(s.categoria || "").toLowerCase();
      const desc = String(s.descripcion || s.nombre || "").toLowerCase();
      if (CATS_AYB.test(cat) || CATS_AYB.test(desc)) {
        result.push({
          id: s.id || `srv-${result.length}`,
          origen: "contratado",
          origenLabel: "Servicio contratado",
          origenColor: "#a78bfa",
          descripcion: s.descripcion || s.nombre || s.categoria || "Servicio",
          cantidad: s.cantidad,
        });
      }
    });
    return result;
  }, [evento]);

  // Mapa para resolver "origen|id" → servicio
  const servicioByKey = Object.fromEntries(serviciosAyB.map(s => [`${s.origen}|${s.id}`, s]));

  const load = async () => {
    setLoading(true);
    const [iR, lR, cR, uR] = await Promise.all([
      supabase.from("items_catalogo")
        .select("id, nombre, categoria, unidad, stock_actual, precio_compra, foto_url")
        .eq("activo", true).order("nombre"),
      supabase.from("items_locaciones").select("id, nombre").order("nombre"),
      supabase.from("eventos_consumo_openbar")
        .select("*").eq("evento_id", eventoId).order("created_at", { ascending: false }),
      supabase.auth.getUser(),
    ]);
    setItems(iR.data || []);
    setLocaciones(lR.data || []);
    setConsumo(cR.data || []);
    setUserEmail(uR.data?.user?.email || "");
    setLoading(false);
  };
  useEffect(() => { load(); }, [eventoId]);

  // Mapa para enriquecer los registros de consumo con info del item
  const itemsById = Object.fromEntries(items.map(i => [i.id, i]));
  const locById   = Object.fromEntries(locaciones.map(l => [l.id, l]));

  // ── Recalc en vivo: si el catálogo tiene precio_compra > 0, usarlo y
  //    recalcular costo_total. Esto cubre el caso de consumos registrados
  //    cuando el catálogo aún estaba en $0 y luego una factura actualizó
  //    el precio. Si el catálogo está en $0, mantenemos el snapshot (no
  //    queremos pisar un precio histórico válido con 0).
  const consumoLive = consumo.map(c => {
    const cat = itemsById[c.item_id];
    const precioLive = Number(cat?.precio_compra) || 0;
    if (precioLive <= 0) return c;
    const cantidad = Number(c.cantidad) || 0;
    return {
      ...c,
      precio_unitario: precioLive,
      costo_total: cantidad * precioLive,
      _precio_snapshot: c.precio_unitario,   // se preserva por si hace falta auditar
    };
  });

  // Filtro de búsqueda en el picker
  const itemsFiltrados = items.filter(i => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${i.nombre || ""} ${i.categoria || ""}`.toLowerCase().includes(q);
  }).slice(0, 50);

  // Vigentes filtrados por tipo activo
  const vigenteTodo = consumoLive.filter(c => !c.anulado);
  const consumoVigente = filtroTipo === "todos"
    ? vigenteTodo
    : vigenteTodo.filter(c => (c.tipo || "openbar") === filtroTipo);

  // Totales por tipo (siempre sobre vigenteTodo, para badges)
  const totalesPorTipo = {};
  vigenteTodo.forEach(c => {
    const t = c.tipo || "openbar";
    if (!totalesPorTipo[t]) totalesPorTipo[t] = { qty: 0, costo: 0, count: 0 };
    totalesPorTipo[t].qty += Number(c.cantidad || 0);
    totalesPorTipo[t].costo += Number(c.costo_total || 0);
    totalesPorTipo[t].count++;
  });

  const totalCosto = consumoVigente.reduce((s, c) => s + Number(c.costo_total || 0), 0);
  const totalUnidades = consumoVigente.reduce((s, c) => s + Number(c.cantidad || 0), 0);

  // Agrupar por categoría para el resumen (sobre el subset filtrado)
  const porCategoria = {};
  consumoVigente.forEach(c => {
    const cat = itemsById[c.item_id]?.categoria || "Otros";
    if (!porCategoria[cat]) porCategoria[cat] = { qty: 0, costo: 0, items: [] };
    porCategoria[cat].qty += Number(c.cantidad || 0);
    porCategoria[cat].costo += Number(c.costo_total || 0);
    porCategoria[cat].items.push(c);
  });

  // Agrupar por SERVICIO de la cotización: cada línea de A&B con sus
  // ingredientes/productos consumidos. Click en un servicio → expande
  // para ver el detalle. Permite ver costo real por línea cotizada.
  const porServicio = {};
  consumoVigente.forEach(c => {
    const key = c.servicio_id ? `${c.servicio_origen}|${c.servicio_id}` : "_sin_servicio";
    if (!porServicio[key]) {
      porServicio[key] = {
        key,
        descripcion: c.servicio_descripcion || "Sin servicio asignado",
        origen: c.servicio_origen || null,
        registros: 0, qty: 0, costo: 0, items: [],
      };
    }
    porServicio[key].registros++;
    porServicio[key].qty += Number(c.cantidad || 0);
    porServicio[key].costo += Number(c.costo_total || 0);
    porServicio[key].items.push(c);
  });
  const serviciosRows = Object.values(porServicio).sort((a, b) => b.costo - a.costo);

  // Agregar el item actual al CARRITO (no guarda en BD todavía).
  // Permite ir cargando varios productos antes de hacer el save final.
  const agregarAlCarrito = () => {
    if (!pickItem) return;
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return alert("Cantidad inválida");
    if (serviciosAyB.length > 0 && !pickServicio) {
      return alert("Seleccioná a qué servicio de A&B aplica este consumo.");
    }
    const precio = Number(pickItem.precio_compra) || 0;
    const sv = pickServicio ? servicioByKey[pickServicio] : null;
    setCarrito(c => [...c, {
      _key: `${pickItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item: pickItem,
      cantidad: qty,
      precio_unitario: precio,
      costo_total: qty * precio,
      tipo: pickTipo,
      servicio: sv,
      locacion_id: locacionId || null,
      notas: notas.trim() || null,
    }]);
    // Reset solo del producto actual; mantenemos tipo/servicio/locación
    // para que el siguiente producto los herede (caso típico).
    setPickItem(null);
    setCantidad("1");
    setNotas("");
    setSearch("");
  };

  const removerDelCarrito = (key) => setCarrito(c => c.filter(x => x._key !== key));

  // Guardar TODO el carrito de una vez. Cierra el modal al terminar.
  const guardarCarrito = async () => {
    if (carrito.length === 0) {
      // Si solo hay un item parcial (con producto seleccionado), agregarlo primero
      if (pickItem) {
        agregarAlCarrito();
        // Re-llamar después de actualizar el state — usuario debe re-clickear
        return;
      }
      return alert("No hay productos en el carrito");
    }
    setSaving(true);
    const payload = carrito.map(c => ({
      evento_id: eventoId,
      item_id: c.item.id,
      cantidad: c.cantidad,
      unidad: c.item.unidad || null,
      locacion_id: c.locacion_id,
      precio_unitario: c.precio_unitario,
      costo_total: c.costo_total,
      tipo: c.tipo,
      servicio_id: c.servicio?.id || null,
      servicio_origen: c.servicio?.origen || null,
      servicio_descripcion: c.servicio?.descripcion || null,
      notas: c.notas,
      registrado_por: userEmail,
      loggro_sync_status: "pendiente",
    }));
    const { data: inserted, error } = await supabase.from("eventos_consumo_openbar").insert(payload).select();
    setSaving(false);
    if (error) return alert("Error: " + error.message);

    // Disparar sync con Loggro para cada uno (fire-and-forget)
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    (inserted || []).forEach(row => {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/consumo-evento-salida`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consumo_id: row.id }),
      }).catch(err => console.warn("[loggro-sync] fallo sync:", err));
    });

    setShowPick(false);
    setCarrito([]);
    setPickItem(null);
    setPickServicio("");
    setCantidad("1");
    setNotas("");
    setSearch("");
    setTimeout(load, 1500);
  };

  const anular = async (c) => {
    const motivo = prompt("Motivo de anulación:");
    if (motivo === null) return;
    await supabase.from("eventos_consumo_openbar").update({
      anulado: true,
      anulado_por: userEmail,
      anulado_at: new Date().toISOString(),
      motivo_anulacion: motivo || "Sin motivo",
    }).eq("id", c.id);
    load();
  };

  const retrySyncLoggro = async (c) => {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/consumo-evento-salida`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ consumo_id: c.id }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    if (!r.ok) alert("Sync falló: " + (r.error || "ver logs"));
    load();
  };

  if (loading) return <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando consumo…</div>;

  return (
    <div style={{ padding: "14px 6px" }}>
      {/* Header con total */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>🍾 Consumo del evento</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            {consumoVigente.length} registro{consumoVigente.length === 1 ? "" : "s"} · {totalUnidades.toLocaleString("es-CO")} unidad{totalUnidades === 1 ? "" : "es"}
            {!ocultarPrecios && <> · Costo: <strong style={{ color: B.sky }}>{COPx(totalCosto)}</strong></>}
          </div>
        </div>
        <button type="button" onClick={() => setShowPick(true)}
          style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Cargar consumo
        </button>
      </div>

      {/* Pills de filtrado por tipo */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setFiltroTipo("todos")}
          style={{ padding: "7px 14px", borderRadius: 18, border: filtroTipo === "todos" ? `1px solid ${B.sky}` : `1px solid ${B.navyLight}`,
            background: filtroTipo === "todos" ? B.sky + "22" : "transparent", color: filtroTipo === "todos" ? B.sky : "rgba(255,255,255,0.5)",
            fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Todos ({vigenteTodo.length})
        </button>
        {TIPOS_CONSUMO.map(t => {
          const tot = totalesPorTipo[t.k] || { count: 0, costo: 0 };
          const active = filtroTipo === t.k;
          return (
            <button key={t.k} type="button" onClick={() => setFiltroTipo(t.k)}
              style={{ padding: "7px 14px", borderRadius: 18, border: active ? `1px solid ${t.color}` : `1px solid ${B.navyLight}`,
                background: active ? t.color + "22" : "transparent", color: active ? t.color : "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <span>{t.icon} {t.l}</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>· {tot.count}{!ocultarPrecios && tot.costo > 0 && ` · ${COPx(tot.costo)}`}</span>
            </button>
          );
        })}
      </div>

      {/* Resumen por categoría */}
      {Object.keys(porCategoria).length > 0 && !ocultarPrecios && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, marginBottom: 14 }}>
          {Object.entries(porCategoria).map(([cat, g]) => (
            <div key={cat} style={{ background: B.navyMid, borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${B.sky}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{cat}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginTop: 2 }}>{COPx(g.costo)}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{g.qty.toLocaleString("es-CO")} unidades</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de consumos */}
      {consumo.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          Sin consumo registrado. Tocá "+ Cargar consumo" cuando empieces a usar productos del open bar.
        </div>
      ) : (<>

      {/* Toggle vista agrupada / lista plana */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={() => setVistaAgrupada(true)}
          style={{ padding: "6px 12px", borderRadius: 16, border: vistaAgrupada ? `1px solid ${B.sky}` : `1px solid ${B.navyLight}`,
            background: vistaAgrupada ? B.sky + "22" : "transparent", color: vistaAgrupada ? B.sky : "rgba(255,255,255,0.5)",
            fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          📊 Por servicio
        </button>
        <button type="button" onClick={() => setVistaAgrupada(false)}
          style={{ padding: "6px 12px", borderRadius: 16, border: !vistaAgrupada ? `1px solid ${B.sky}` : `1px solid ${B.navyLight}`,
            background: !vistaAgrupada ? B.sky + "22" : "transparent", color: !vistaAgrupada ? B.sky : "rgba(255,255,255,0.5)",
            fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          📋 Lista plana
        </button>
      </div>

      {vistaAgrupada ? (
        // ── Vista agrupada por servicio ──────────────────────────────
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {serviciosRows.map(s => {
            const isOpen = !!servicioAbierto[s.key];
            // Subgrupo por categoría dentro del servicio
            const porCat = {};
            s.items.forEach(c => {
              const cat = itemsById[c.item_id]?.categoria || "Otros";
              if (!porCat[cat]) porCat[cat] = { qty: 0, costo: 0, items: [] };
              porCat[cat].qty += Number(c.cantidad || 0);
              porCat[cat].costo += Number(c.costo_total || 0);
              porCat[cat].items.push(c);
            });
            return (
              <div key={s.key} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: isOpen ? `1px solid ${B.sky}55` : `1px solid transparent` }}>
                {/* Header del servicio (clickeable) */}
                <button type="button" onClick={() => toggleServicio(s.key)}
                  style={{ display: "grid", gridTemplateColumns: "30px 1fr 90px 90px 110px", gap: 10, alignItems: "center",
                    width: "100%", padding: "12px 16px", background: "transparent", border: "none", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 16, color: B.sky }}>{isOpen ? "▼" : "▶"}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📋 {s.descripcion}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                      {s.registros} registro{s.registros === 1 ? "" : "s"} · {s.qty.toLocaleString("es-CO")} unidades · {Object.keys(porCat).length} categoría{Object.keys(porCat).length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {s.registros}<br/><span style={{ fontSize: 9 }}>productos</span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {s.qty.toLocaleString("es-CO")}<br/><span style={{ fontSize: 9 }}>unidades</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {!ocultarPrecios && (
                      <div style={{ fontSize: 16, fontWeight: 800, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{COPx(s.costo)}</div>
                    )}
                  </div>
                </button>

                {/* Detalle expandido */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${B.navyLight}` }}>
                    {Object.entries(porCat).sort((a, b) => b[1].costo - a[1].costo).map(([cat, g]) => (
                      <div key={cat}>
                        <div style={{ background: B.navy, padding: "6px 18px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                          <span>{cat}</span>
                          <span style={{ color: "rgba(255,255,255,0.5)" }}>
                            {g.items.length} × {g.qty.toLocaleString("es-CO")} unidades{!ocultarPrecios && ` · ${COPx(g.costo)}`}
                          </span>
                        </div>
                        {g.items.map(c => {
                          const it = itemsById[c.item_id];
                          const tInfo = tipoInfo(c.tipo || "openbar");
                          return (
                            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 110px 100px 36px", gap: 10, padding: "8px 18px", borderTop: `1px solid ${B.navyLight}`, fontSize: 12, opacity: c.anulado ? 0.4 : 1, textDecoration: c.anulado ? "line-through" : "none" }}>
                              <div>
                                <div style={{ color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: tInfo.color + "22", color: tInfo.color, fontWeight: 700 }}>{tInfo.icon}</span>
                                  <span>{it?.nombre || c.item_id}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                                  {c.notas ? `${c.notas} · ` : ""}{c.registrado_por && `por ${c.registrado_por.split("@")[0]}`}
                                  {c.anulado && c.motivo_anulacion && ` · anulado: ${c.motivo_anulacion}`}
                                </div>
                              </div>
                              <div style={{ textAlign: "right", color: "#fff" }}>{Number(c.cantidad).toLocaleString("es-CO")}</div>
                              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{locById[c.locacion_id]?.nombre || "—"}</div>
                              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)" }}>{ocultarPrecios ? "" : COPx(c.precio_unitario)}</div>
                              <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{ocultarPrecios ? "" : COPx(c.costo_total)}</div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                {!c.anulado && c.loggro_sync_status === "ok" && <span title={`Loggro mov ${c.loggro_movement_id || ""}`} style={{ fontSize: 9, color: "#22c55e" }}>🔗</span>}
                                {!c.anulado && c.loggro_sync_status === "pendiente" && <span style={{ fontSize: 9, color: B.warning }}>⏳</span>}
                                {!c.anulado && c.loggro_sync_status === "error" && (
                                  <button type="button" onClick={() => retrySyncLoggro(c)} title={c.loggro_sync_error}
                                    style={{ background: "transparent", border: `1px solid ${B.danger}55`, color: B.danger, cursor: "pointer", fontSize: 9, padding: "1px 5px", borderRadius: 4 }}>⚠</button>
                                )}
                                {!c.anulado && (
                                  <button type="button" onClick={() => anular(c)} title="Anular" style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // ── Vista plana (lista lineal) ───────────────────────────────
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 110px 100px 36px", gap: 10, padding: "10px 14px", background: B.navy, fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
            <div>Producto</div>
            <div style={{ textAlign: "right" }}>Cant.</div>
            <div>Locación</div>
            <div style={{ textAlign: "right" }}>{ocultarPrecios ? "" : "P. Unit"}</div>
            <div style={{ textAlign: "right" }}>{ocultarPrecios ? "" : "Total"}</div>
            <div></div>
          </div>
          {(filtroTipo === "todos" ? consumo : consumo.filter(c => (c.tipo || "openbar") === filtroTipo)).map(c => {
            const it = itemsById[c.item_id];
            const loc = locById[c.locacion_id];
            const tInfo = tipoInfo(c.tipo || "openbar");
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 110px 100px 36px", gap: 10, padding: "10px 14px", borderTop: `1px solid ${B.navyLight}`, fontSize: 12, opacity: c.anulado ? 0.4 : 1, textDecoration: c.anulado ? "line-through" : "none" }}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <span title={tInfo.l} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: tInfo.color + "22", color: tInfo.color, fontWeight: 700 }}>{tInfo.icon}</span>
                    <span>{it?.nombre || c.item_id}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                    {it?.categoria || "—"}
                    {c.servicio_descripcion && (
                      <> · <span style={{ color: "#fbbf24" }}>📋 {c.servicio_descripcion}</span></>
                    )}
                    {c.notas ? ` · ${c.notas}` : ""}
                    {c.registrado_por && ` · por ${c.registrado_por.split("@")[0]}`}
                    {c.anulado && c.motivo_anulacion && ` · anulado: ${c.motivo_anulacion}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", color: "#fff" }}>{Number(c.cantidad).toLocaleString("es-CO")}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{loc?.nombre || "—"}</div>
                <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)" }}>{ocultarPrecios ? "" : COPx(c.precio_unitario)}</div>
                <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{ocultarPrecios ? "" : COPx(c.costo_total)}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {/* Indicador de sync con Loggro */}
                  {!c.anulado && c.loggro_sync_status === "ok" && (
                    <span title={`Sincronizado · Loggro mov ${c.loggro_movement_id || ""}`}
                      style={{ fontSize: 9, color: "#22c55e" }}>🔗 Loggro</span>
                  )}
                  {!c.anulado && c.loggro_sync_status === "pendiente" && (
                    <span title="Sincronizando con Loggro…" style={{ fontSize: 9, color: B.warning }}>⏳ sync…</span>
                  )}
                  {!c.anulado && c.loggro_sync_status === "error" && (
                    <button type="button" onClick={() => retrySyncLoggro(c)}
                      title={c.loggro_sync_error || "Error al sincronizar con Loggro"}
                      style={{ background: "transparent", border: `1px solid ${B.danger}55`, color: B.danger, cursor: "pointer", fontSize: 9, padding: "2px 6px", borderRadius: 4 }}>
                      ⚠ retry
                    </button>
                  )}
                  {!c.anulado && (
                    <button type="button" onClick={() => anular(c)} title="Anular" style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}

      {/* Modal de selección */}
      {showPick && (
        <div onClick={() => setShowPick(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: B.navy, borderRadius: 16, padding: 22, maxWidth: 560, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>+ Cargar consumo</div>
              <button type="button" onClick={() => setShowPick(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22 }}>×</button>
            </div>

            {/* Servicio de A&B al que aplica este consumo */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
                Servicio A&B del evento *
              </label>
              {serviciosAyB.length === 0 ? (
                <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.08)", border: `1px solid ${B.warning}55`, borderRadius: 8, fontSize: 11, color: B.warning }}>
                  ⚠️ No hay servicios de A&B en la cotización. Agregá items de "Alimentos y Bebidas" en la cotización primero.
                </div>
              ) : (
                <select value={pickServicio} onChange={e => setPickServicio(e.target.value)} required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                  <option value="">— Seleccionar servicio —</option>
                  {Object.entries(serviciosAyB.reduce((acc, s) => {
                    if (!acc[s.origenLabel]) acc[s.origenLabel] = [];
                    acc[s.origenLabel].push(s);
                    return acc;
                  }, {})).map(([grupo, items]) => (
                    <optgroup key={grupo} label={grupo}>
                      {items.map(s => (
                        <option key={`${s.origen}|${s.id}`} value={`${s.origen}|${s.id}`}>
                          {s.descripcion}{s.cantidad ? ` (×${s.cantidad})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                Permite reportar costo por línea de cotización (ej: cuánto costó "Open Bar Premium").
              </div>
            </div>

            {/* Selector de tipo: en qué categoría va este consumo */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Tipo de consumo</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {TIPOS_CONSUMO.map(t => (
                  <button key={t.k} type="button" onClick={() => setPickTipo(t.k)}
                    style={{ padding: "9px 10px", borderRadius: 8, border: pickTipo === t.k ? `2px solid ${t.color}` : `1px solid ${B.navyLight}`,
                      background: pickTipo === t.k ? t.color + "22" : B.navyMid, color: pickTipo === t.k ? t.color : "rgba(255,255,255,0.6)",
                      cursor: "pointer", fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>
                    <div style={{ fontSize: 18, marginBottom: 2 }}>{t.icon}</div>
                    {t.l}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, textAlign: "center" }}>{tipoInfo(pickTipo).desc}</div>
            </div>

            {!pickItem ? (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="🔍 Buscar producto…" autoFocus
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
                <div style={{ background: B.navyMid, borderRadius: 8, maxHeight: 360, overflowY: "auto" }}>
                  {itemsFiltrados.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Sin coincidencias</div>
                  ) : itemsFiltrados.map(i => (
                    <button key={i.id} type="button" onClick={() => setPickItem(i)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${B.navyLight}`, color: "#fff", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: i.foto_url ? `url(${i.foto_url}) center/cover` : B.navyLight, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                        {!i.foto_url && "📦"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nombre}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                          {i.categoria || "—"} · Stock: {Number(i.stock_actual || 0).toLocaleString("es-CO")} {i.unidad || ""}
                          {!ocultarPrecios && i.precio_compra > 0 && ` · ${COPx(i.precio_compra)}/u`}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: B.success, fontWeight: 700 }}>+</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setPickItem(null)}
                  style={{ background: "none", border: "none", color: B.sky, fontSize: 11, cursor: "pointer", marginBottom: 10, padding: 0 }}>← Cambiar producto</button>
                <div style={{ background: B.navyMid, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{pickItem.nombre}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {pickItem.categoria || "—"} · Stock actual: {Number(pickItem.stock_actual || 0).toLocaleString("es-CO")} {pickItem.unidad || ""}
                    {!ocultarPrecios && pickItem.precio_compra > 0 && ` · ${COPx(pickItem.precio_compra)} c/u`}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Cantidad</label>
                    <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} step="0.01" min="0.01" autoFocus
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Locación (descuenta de)</label>
                    <select value={locacionId} onChange={e => setLocacionId(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                      <option value="">— Sin descontar locación —</option>
                      {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Notas (opcional)</label>
                  <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: barra principal, reserva VIP…"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>

                {!ocultarPrecios && (
                  <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Costo</span>
                    <strong style={{ color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>
                      {COPx((Number(cantidad) || 0) * (Number(pickItem.precio_compra) || 0))}
                    </strong>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" onClick={() => setPickItem(null)}
                    style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: B.navyLight, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }} disabled={saving}>Cancelar producto</button>
                  <button type="button" onClick={agregarAlCarrito}
                    style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, cursor: "pointer", fontWeight: 700, fontSize: 13 }} disabled={saving}>
                    + Agregar al carrito
                  </button>
                </div>
              </>
            )}

            {/* ── Carrito de productos por guardar ── */}
            {carrito.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `2px solid ${B.sky}55` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.sky, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    🛒 Carrito ({carrito.length} producto{carrito.length === 1 ? "" : "s"})
                  </div>
                  {!ocultarPrecios && (
                    <span style={{ fontSize: 14, fontWeight: 800, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>
                      Total: {COPx(carrito.reduce((s, x) => s + (x.costo_total || 0), 0))}
                    </span>
                  )}
                </div>
                <div style={{ background: B.navyMid, borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                  {carrito.map(c => (
                    <div key={c._key} style={{ padding: "8px 12px", borderBottom: `1px solid ${B.navyLight}`, display: "grid", gridTemplateColumns: "1fr 60px 90px 28px", gap: 8, alignItems: "center", fontSize: 11 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.item.nombre}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                          {tipoInfo(c.tipo).icon} {c.servicio?.descripcion || "—"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", color: "rgba(255,255,255,0.65)" }}>{c.cantidad} {c.item.unidad || ""}</div>
                      <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>
                        {ocultarPrecios ? "" : COPx(c.costo_total)}
                      </div>
                      <button type="button" onClick={() => removerDelCarrito(c._key)}
                        style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botones del modal: cerrar / guardar todo el carrito */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button type="button" onClick={() => { if (carrito.length > 0 && !confirm(`¿Descartar ${carrito.length} producto${carrito.length === 1 ? "" : "s"} del carrito?`)) return; setShowPick(false); setCarrito([]); setPickItem(null); setSearch(""); }}
                style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.navyLight, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }} disabled={saving}>
                Cerrar
              </button>
              <button type="button" onClick={guardarCarrito} disabled={saving || carrito.length === 0}
                style={{ padding: "10px 22px", borderRadius: 8, border: "none",
                  background: carrito.length === 0 ? B.navyLight : B.success,
                  color: "#fff", cursor: carrito.length === 0 ? "default" : "pointer", fontWeight: 800, fontSize: 13,
                  opacity: carrito.length === 0 ? 0.5 : 1 }}>
                {saving ? "Guardando…" : carrito.length === 0 ? "Agregá productos primero" : `✓ Registrar ${carrito.length} consumo${carrito.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TabPL — P/L confidencial del evento
// Solo visible para super_admin, admin, gerente_general_*, contabilidad
// y Eric. Muestra cotizado vs costos reales (consumo + extras) = margen.
// ─────────────────────────────────────────────────────────────────────
function TabPL({ evento }) {
  const [consumo, setConsumo] = useState([]);
  const [gastosTerc, setGastosTerc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const COPx = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

  useEffect(() => {
    if (!evento?.id) return;
    setLoading(true);
    Promise.all([
      supabase.from("eventos_consumo_openbar").select("*").eq("evento_id", evento.id).eq("anulado", false),
      supabase.from("eventos_servicios_gastos").select("*").eq("evento_id", evento.id).neq("estado", "anulado"),
      supabase.from("items_catalogo").select("id, precio_compra").eq("activo", true),
    ]).then(([cR, gR, iR]) => {
      if (cR.error) console.warn("[P/L] error consumo:", cR.error);
      if (gR.error) console.warn("[P/L] error gastos:", gR.error);
      // Recalc en vivo: aplicar precio_compra del catálogo a los registros de
      // consumo. Si el catálogo trae > 0, sobreescribe el snapshot (cubre el
      // caso típico donde el consumo se registró antes que la factura
      // actualizara el precio). Si el catálogo está en 0, conserva snapshot.
      const priceMap = Object.fromEntries((iR.data || []).map(i => [i.id, Number(i.precio_compra) || 0]));
      const consumoLive = (cR.data || []).map(c => {
        const live = priceMap[c.item_id] || 0;
        if (live <= 0) return c;
        const cant = Number(c.cantidad) || 0;
        return { ...c, precio_unitario: live, costo_total: cant * live, _precio_snapshot: c.precio_unitario };
      });
      setConsumo(consumoLive);
      setGastosTerc(gR.data || []);
      setLoading(false);
    });
  }, [evento?.id, refreshKey]);

  if (loading) return <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando P/L…</div>;

  // ── INGRESOS ────────────────────────────────────────────────────
  const cot = evento.cotizacion_data || {};
  const calcSum = (rows = []) => rows.reduce((s, l) => {
    const sub = (Number(l.cantidad) || 1) * (Number(l.noches) || 1) * (Number(l.valor_unit) || 0);
    return s + sub + sub * ((Number(l.iva) || 0) / 100);
  }, 0);
  // Separar propina de "Otros servicios" — es un cargo distinto.
  const isPropina = (l) => /propina|tip\b|gratuit/i.test(l?.concepto || l?.descripcion || "");
  const cotServiciosNoProp = (cot.servicios || []).filter(l => !isPropina(l));
  const cotPropinas         = (cot.servicios || []).filter(l =>  isPropina(l));
  const ingEspacios   = calcSum(cot.espacios);
  const ingHospedaje  = calcSum(cot.hospedaje || cot.alojamientos);
  const ingAlimentos  = calcSum(cot.alimentos);
  const ingOtrosCot   = calcSum(cotServiciosNoProp);
  const ingPropina    = calcSum(cotPropinas);
  const ingServicios  = (evento.servicios_contratados || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
  // evento.valor incluye propina. La propina NO es ingreso de Atolón
  // (se entrega al staff), así que la restamos para tener el valor base
  // limpio. ingresoTotal tampoco incluye propina.
  const valorBase     = Math.max(0, (Number(evento.valor) || 0) - ingPropina);
  const valorExtras   = Number(evento.valor_extras) || 0;
  const ingresoTotal  = Math.max(
    valorBase + valorExtras + ingServicios,
    ingEspacios + ingHospedaje + ingAlimentos + ingOtrosCot,
  );

  // ── COSTOS ──────────────────────────────────────────────────────
  const costoConsumo = consumo.reduce((s, c) => s + (Number(c.costo_total) || 0), 0);
  const costoGastosTerc = gastosTerc.reduce((s, g) => s + (Number(g.total) || 0), 0);
  const costoExtras  = ["transporte", "alimentos", "servicios"].reduce((s, k) =>
    s + calcSum((evento.extras_data || {})[k]), 0);
  const costoTotal = costoConsumo + costoGastosTerc + costoExtras;
  const margen = ingresoTotal - costoTotal;
  const margenPct = ingresoTotal > 0 ? (margen / ingresoTotal) * 100 : 0;

  // ── Desglose por servicio A&B: COSTO real por línea ─────────────
  // Suma DOS fuentes:
  //   • consumo de cocina/openbar (eventos_consumo_openbar)
  //   • gastos a terceros (eventos_servicios_gastos)
  // Ambos guardan servicio_id con la misma convención (key compuesta).
  const consumoPorServicio = {};
  consumo.forEach(c => {
    const key = c.servicio_id ? `${c.servicio_origen}|${c.servicio_id}` : "_sin";
    if (!consumoPorServicio[key]) {
      consumoPorServicio[key] = { descripcion: c.servicio_descripcion || "Sin servicio asignado", costo: 0 };
    }
    consumoPorServicio[key].costo += Number(c.costo_total) || 0;
  });
  // gastosTerc.servicio_id ya viene como key compuesta "{origen}|{id}"
  // (se registra así desde el modal de gastos)
  gastosTerc.forEach(g => {
    const key = g.servicio_id || "_sin";
    if (!consumoPorServicio[key]) {
      consumoPorServicio[key] = { descripcion: g.servicio_descripcion || "Sin servicio asignado", costo: 0 };
    }
    consumoPorServicio[key].costo += Number(g.total) || 0;
  });
  const ayBLines = [];
  // IMPORTANTE: los alimentos en cotizacion_data NO tienen campo id propio
  // (heredan iva/noches/cantidad/concepto/valor_unit). Cuando el modal de
  // consumo los carga, les asigna `alim-${index}` como id. Acá hay que usar
  // la MISMA convención para que los keys matcheen con servicio_id del
  // consumo (`alimento|alim-N`).
  (cot.alimentos || []).forEach((a, i) => {
    if (!a) return;
    const key = `alimento|${a.id || `alim-${i}`}`;
    const sub = (Number(a.cantidad) || 1) * (Number(a.noches) || 1) * (Number(a.valor_unit) || 0);
    ayBLines.push({
      key, descripcion: a.concepto || a.descripcion || "Sin nombre", origen: "Cotizado A&B",
      cobrado: sub + sub * ((Number(a.iva) || 0) / 100), costo: consumoPorServicio[key]?.costo || 0,
    });
  });
  ((evento.extras_data || {}).alimentos || []).forEach((a, i) => {
    if (!a) return;
    const key = `extra_alimento|${a.id || `extra-alim-${i}`}`;
    const sub = (Number(a.cantidad) || 1) * (Number(a.noches) || 1) * (Number(a.valor_unit) || 0);
    ayBLines.push({
      key, descripcion: a.concepto || a.descripcion || "Sin nombre", origen: "Extra A&B",
      cobrado: sub + sub * ((Number(a.iva) || 0) / 100), costo: consumoPorServicio[key]?.costo || 0,
    });
  });
  const CATS_AYB = /banquete|bebida|restaurant|alimento|comida|menu|cocktail|coctel|food|catering/i;
  (evento.servicios_contratados || []).forEach(s => {
    if (!s) return;
    const cat = String(s.categoria || "").toLowerCase();
    const desc = String(s.descripcion || "").toLowerCase();
    if (CATS_AYB.test(cat) || CATS_AYB.test(desc)) {
      const key = `contratado|${s.id}`;
      ayBLines.push({
        key, descripcion: s.descripcion || s.categoria, origen: "Servicio contratado",
        cobrado: Number(s.valor) || 0, costo: consumoPorServicio[key]?.costo || 0,
      });
    }
  });
  if (consumoPorServicio._sin) {
    ayBLines.push({ key: "_sin", descripcion: "Sin servicio asignado", origen: "—",
      cobrado: 0, costo: consumoPorServicio._sin.costo });
  }

  return (
    <div style={{ padding: "14px 6px" }}>
      <div style={{ background: "rgba(245,158,11,0.08)", border: `1px solid ${B.warning}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: B.warning, display: "flex", alignItems: "center", gap: 8 }}>
        🔒 <strong>Información confidencial.</strong> Solo visible para Gerencia General, Contabilidad y Dirección.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", borderLeft: `4px solid ${B.success}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ingreso (cotizado)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: B.success, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COPx(ingresoTotal)}</div>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", borderLeft: `4px solid ${B.danger}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Costo (real)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: B.danger, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COPx(costoTotal)}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
            Consumo {COPx(costoConsumo)}{costoExtras > 0 && ` · Extras ${COPx(costoExtras)}`}
          </div>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", borderLeft: `4px solid ${margen >= 0 ? B.sky : B.danger}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Margen bruto</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: margen >= 0 ? B.sky : B.danger, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COPx(margen)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{margenPct.toFixed(1)}%</div>
        </div>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>📊 Desglose por servicio A&B</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Cobrado al cliente vs costo real (consumo)</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 70px", gap: 10, padding: "10px 16px", background: B.navy, fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
          <div>Servicio</div>
          <div style={{ textAlign: "right" }}>Cobrado</div>
          <div style={{ textAlign: "right" }}>Costo</div>
          <div style={{ textAlign: "right" }}>Margen</div>
          <div style={{ textAlign: "right" }}>%</div>
        </div>
        {ayBLines.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 12, fontStyle: "italic" }}>
            Sin items de A&B en la cotización.
          </div>
        ) : ayBLines.map(l => {
          const m = l.cobrado - l.costo;
          const pct = l.cobrado > 0 ? (m / l.cobrado) * 100 : 0;
          return (
            <div key={l.key} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 70px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 12 }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600 }}>{l.descripcion}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{l.origen}</div>
              </div>
              <div style={{ textAlign: "right", color: B.success, fontWeight: 600 }}>{COPx(l.cobrado)}</div>
              <div style={{ textAlign: "right", color: B.danger }}>{COPx(l.costo)}</div>
              <div style={{ textAlign: "right", color: m >= 0 ? B.sky : B.danger, fontWeight: 700 }}>{COPx(m)}</div>
              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{l.cobrado > 0 ? pct.toFixed(0) + "%" : "—"}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.success, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>💰 Ingresos cotizados</div>
          {[
            ["Espacios",   ingEspacios],
            ["Hospedaje",  ingHospedaje],
            ["Alimentos y Bebidas", ingAlimentos],
            ["Otros servicios cotizados", ingOtrosCot],
            ["Servicios contratados", ingServicios],
            ["Valor base evento", valorBase],
            ["Valor extras", valorExtras],
          ].filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>{k}</span>
              <span style={{ color: "#fff", fontWeight: 700 }}>{COPx(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: `2px solid ${B.success}`, fontSize: 14, fontWeight: 800 }}>
            <span>Total ingreso</span><span style={{ color: B.success }}>{COPx(ingresoTotal)}</span>
          </div>
          {ingPropina > 0 && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(245,158,11,0.08)", border: `1px solid ${B.warning}33`, borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>💵 Propina cobrada (entregada al staff)</span>
              <span style={{ color: B.warning, fontWeight: 700 }}>{COPx(ingPropina)}</span>
            </div>
          )}
        </div>

        <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.danger, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>📦 Costos reales</div>
          {[
            ["🍾 Open Bar (consumo)", consumo.filter(c => c.tipo === "openbar").reduce((s, c) => s + (Number(c.costo_total) || 0), 0)],
            ["🍽️ Buffet (consumo)",   consumo.filter(c => c.tipo === "cocina_buffet").reduce((s, c) => s + (Number(c.costo_total) || 0), 0)],
            ["🎁 Paquete (consumo)",  consumo.filter(c => c.tipo === "cocina_paquete").reduce((s, c) => s + (Number(c.costo_total) || 0), 0)],
            ["🧾 Servicios contratados (facturas)", costoGastosTerc],
            ["Extras transporte", calcSum((evento.extras_data || {}).transporte)],
            ["Extras alimentos",  calcSum((evento.extras_data || {}).alimentos)],
            ["Extras otros",      calcSum((evento.extras_data || {}).servicios)],
          ].filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>{k}</span>
              <span style={{ color: "#fff", fontWeight: 700 }}>{COPx(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: `2px solid ${B.danger}`, fontSize: 14, fontWeight: 800 }}>
            <span>Total</span><span style={{ color: B.danger }}>{COPx(costoTotal)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, padding: "10px 14px", background: margen >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", borderRadius: 10, border: `1px solid ${margen >= 0 ? B.success : B.danger}55`, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
        💡 El P/L se actualiza automáticamente al registrar consumos en el tab 🍾 Consumo. El costo se captura como snapshot al momento del registro (precio_compra del item) — el P/L histórico no cambia si después suben los precios.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TabGastosServicios — Gastos/facturas de servicios contratados (terceros)
// Cada gasto: proveedor, concepto, monto, IVA, fecha, factura PDF, estado.
// Se vincula opcionalmente a un servicio del evento (servicios_contratados).
// ─────────────────────────────────────────────────────────────────────
function TabGastosServicios({ evento, ocultarPrecios = false }) {
  const [gastos, setGastos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);  // gasto en edición
  const COPx = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

  const load = async () => {
    setLoading(true);
    const [gR, pR] = await Promise.all([
      supabase.from("eventos_servicios_gastos").select("*").eq("evento_id", evento.id).order("fecha", { ascending: false }),
      supabase.from("proveedores").select("id, nombre, nit").order("nombre"),
    ]);
    setGastos(gR.data || []);
    setProveedores(pR.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [evento.id]);

  // ── Servicios disponibles del evento — incluye TODO lo cotizado ──
  // No solo servicios_contratados sino también items de cotizacion_data
  // (espacios, hospedaje, alimentos, otros servicios) y extras_data.
  // Cada uno con su key compuesta {origen}|{id} para guardar en el gasto.
  const cot = evento.cotizacion_data || {};
  const extras = evento.extras_data || {};
  const calcLine = (l) => {
    const sub = (Number(l.cantidad) || 1) * (Number(l.noches) || 1) * (Number(l.valor_unit) || 0);
    return sub + sub * ((Number(l.iva) || 0) / 100);
  };
  const serviciosEvento = [];
  (cot.espacios || []).forEach((a, i) => a && serviciosEvento.push({
    key: `espacio|${a.id || `esp-${i}`}`, origen: "Espacios cotizados", origenColor: "#a78bfa",
    descripcion: a.concepto || a.descripcion || "Espacio", cobrado: calcLine(a),
  }));
  (cot.hospedaje || cot.alojamientos || []).forEach((a, i) => a && serviciosEvento.push({
    key: `hospedaje|${a.id || `hos-${i}`}`, origen: "Hospedaje", origenColor: "#ec4899",
    descripcion: a.concepto || a.descripcion || "Hospedaje", cobrado: calcLine(a),
  }));
  (cot.alimentos || []).forEach((a, i) => a && serviciosEvento.push({
    key: `alimento|${a.id || `alim-${i}`}`, origen: "Alimentos & Bebidas (cotizado)", origenColor: "#f59e0b",
    descripcion: a.concepto || a.descripcion || "A&B", cobrado: calcLine(a),
  }));
  (cot.servicios || []).forEach((a, i) => a && serviciosEvento.push({
    key: `otro_cotizado|${a.id || `cot-${i}`}`, origen: "Otros servicios cotizados", origenColor: "#7B4F12",
    descripcion: a.concepto || a.descripcion || "Servicio", cobrado: calcLine(a),
  }));
  (evento.servicios_contratados || []).forEach((s, i) => s && serviciosEvento.push({
    key: `contratado|${s.id || `srv-${i}`}`, origen: "Servicio contratado", origenColor: "#22c55e",
    descripcion: s.descripcion || s.categoria || "Servicio", cobrado: Number(s.valor) || 0,
  }));
  (extras.transporte || []).forEach((a, i) => a && serviciosEvento.push({
    key: `extra_transporte|${a.id || `et-${i}`}`, origen: "Extra transporte", origenColor: "#06b6d4",
    descripcion: a.concepto || "Transporte", cobrado: calcLine(a),
  }));
  (extras.alimentos || []).forEach((a, i) => a && serviciosEvento.push({
    key: `extra_alimento|${a.id || `ea-${i}`}`, origen: "Extra A&B", origenColor: "#fb923c",
    descripcion: a.concepto || "A&B extra", cobrado: calcLine(a),
  }));
  (extras.servicios || []).forEach((a, i) => a && serviciosEvento.push({
    key: `extra_servicio|${a.id || `es-${i}`}`, origen: "Extra servicio", origenColor: "#94a3b8",
    descripcion: a.concepto || "Servicio extra", cobrado: calcLine(a),
  }));

  // Resumen "Cobrado vs Gastado": SOLO items que tengan algún gasto
  // registrado. Los items cotizados sin gasto NO aparecen — esto es un
  // resumen de gastos efectivos, no del avance de la cotización.
  const porServicio = {};
  const serviciosEventoByKey = Object.fromEntries(serviciosEvento.map(s => [s.key, s]));
  gastos.filter(g => g.estado !== "anulado").forEach(g => {
    const key = g.servicio_id || "_sin_vincular";
    if (!porServicio[key]) {
      const s = serviciosEventoByKey[key];
      porServicio[key] = {
        descripcion: s?.descripcion || g.servicio_descripcion || "Sin vincular a servicio",
        origen:      s?.origen      || (g.servicio_id ? "Servicio archivado" : "Gasto general"),
        origenColor: s?.origenColor || "rgba(255,255,255,0.4)",
        cobrado:     s?.cobrado     || 0,
        gastado: 0, gastosPagados: 0, gastosPendientes: 0,
      };
    }
    porServicio[key].gastado += Number(g.total) || 0;
    if (g.estado === "pagado") porServicio[key].gastosPagados   += Number(g.total) || 0;
    else                       porServicio[key].gastosPendientes += Number(g.total) || 0;
  });

  const totalGastos = gastos.filter(g => g.estado !== "anulado").reduce((s, g) => s + (Number(g.total) || 0), 0);
  const totalPagado = gastos.filter(g => g.estado === "pagado").reduce((s, g) => s + (Number(g.total) || 0), 0);
  const totalPendiente = gastos.filter(g => g.estado === "pendiente").reduce((s, g) => s + (Number(g.total) || 0), 0);

  const eliminar = async (g) => {
    if (!confirm(`¿Anular gasto "${g.concepto}" de ${COPx(g.total)}?`)) return;
    await supabase.from("eventos_servicios_gastos").update({ estado: "anulado", updated_at: new Date().toISOString() }).eq("id", g.id);
    load();
  };
  const marcarPagado = async (g) => {
    await supabase.from("eventos_servicios_gastos").update({
      estado: "pagado", pagado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", g.id);
    load();
  };

  if (loading) return <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;

  return (
    <div style={{ padding: "14px 6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>🧾 Gastos de servicios contratados</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            {gastos.filter(g => g.estado !== "anulado").length} factura{gastos.length === 1 ? "" : "s"}
            {!ocultarPrecios && <> · Total: <strong style={{ color: B.sky }}>{COPx(totalGastos)}</strong></>}
          </div>
        </div>
        <button type="button" onClick={() => { setEditing(null); setShowAdd(true); }}
          style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nueva factura/gasto
        </button>
      </div>

      {/* KPIs */}
      {!ocultarPrecios && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
          {[
            { l: "Total facturado", v: COPx(totalGastos),  c: B.sky },
            { l: "Pagado",          v: COPx(totalPagado),  c: "#22c55e" },
            { l: "Pendiente",       v: COPx(totalPendiente), c: "#fbbf24" },
          ].map(k => (
            <div key={k.l} style={{ background: B.navyMid, borderRadius: 10, padding: "10px 14px", borderLeft: `3px solid ${k.c}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k.l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.c, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2 }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen por servicio contratado (cobrado vs gastado) */}
      {!ocultarPrecios && Object.keys(porServicio).length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12, fontWeight: 700, color: "#fff" }}>
            📊 Cobrado al cliente vs gastado a terceros
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 70px", gap: 10, padding: "8px 14px", background: B.navy, fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
            <div>Servicio contratado</div>
            <div style={{ textAlign: "right" }}>Cobrado</div>
            <div style={{ textAlign: "right" }}>Gastado</div>
            <div style={{ textAlign: "right" }}>Margen</div>
            <div style={{ textAlign: "right" }}>%</div>
          </div>
          {Object.entries(porServicio)
            .sort(([, a], [, b]) => b.gastado - a.gastado)
            .map(([id, s]) => {
              const m = s.cobrado - s.gastado;
              const pct = s.cobrado > 0 ? (m / s.cobrado) * 100 : 0;
              return (
                <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 70px", gap: 10, padding: "8px 14px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11 }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{s.descripcion}</div>
                    <div style={{ fontSize: 9, color: s.origenColor, marginTop: 1 }}>{s.origen}</div>
                  </div>
                  <div style={{ textAlign: "right", color: B.success }}>{COPx(s.cobrado)}</div>
                  <div style={{ textAlign: "right", color: B.danger }}>{COPx(s.gastado)}</div>
                  <div style={{ textAlign: "right", color: m >= 0 ? B.sky : B.danger, fontWeight: 700 }}>{COPx(m)}</div>
                  <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)" }}>{s.cobrado > 0 ? pct.toFixed(0) + "%" : "—"}</div>
                </div>
              );
            })}
        </div>
      )}

      {/* Lista de gastos */}
      {gastos.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          Sin facturas ni gastos registrados todavía. Click "+ Nueva factura/gasto" para empezar.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px 110px 110px 80px", gap: 10, padding: "10px 14px", background: B.navy, fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
            <div>Concepto · Servicio</div>
            <div>Proveedor</div>
            <div>Fecha</div>
            <div style={{ textAlign: "right" }}>{ocultarPrecios ? "Estado" : "Total"}</div>
            <div>Estado</div>
            <div></div>
          </div>
          {gastos.map(g => {
            const sv = serviciosEvento.find(s => s.key === g.servicio_id);
            const estadoColor = g.estado === "pagado" ? "#22c55e" : g.estado === "anulado" ? "#64748B" : "#fbbf24";
            return (
              <div key={g.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px 110px 110px 80px", gap: 10, padding: "10px 14px", borderTop: `1px solid ${B.navyLight}`, fontSize: 12, opacity: g.estado === "anulado" ? 0.4 : 1, textDecoration: g.estado === "anulado" ? "line-through" : "none", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 600 }}>{g.concepto}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                    {sv ? <span style={{ color: sv.origenColor }}>📋 {sv.descripcion}</span>
                       : g.servicio_descripcion ? <span style={{ color: "#fbbf24" }}>📋 {g.servicio_descripcion}</span>
                       : "—"}
                    {g.factura_numero ? ` · Fact #${g.factura_numero}` : ""}
                    {g.metodo_pago && ` · ${g.metodo_pago}`}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>{g.proveedor_nombre || "—"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{g.fecha ? new Date(g.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—"}</div>
                <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{ocultarPrecios ? "" : COPx(g.total)}</div>
                <div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: estadoColor + "22", color: estadoColor, fontWeight: 700, textTransform: "uppercase" }}>
                    {g.estado}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  {g.factura_url && (
                    <button type="button" onClick={async () => {
                      const path = g.factura_url.replace(/^.*facturas-servicios\//, "");
                      const { data } = await supabase.storage.from("facturas-servicios").createSignedUrl(path, 60);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }} title="Ver factura" style={{ background: "transparent", border: "none", color: B.sky, cursor: "pointer", fontSize: 14 }}>📎</button>
                  )}
                  {g.estado === "pendiente" && (
                    <button type="button" onClick={() => marcarPagado(g)} title="Marcar pagado" style={{ background: "transparent", border: "none", color: "#22c55e", cursor: "pointer", fontSize: 14 }}>✓</button>
                  )}
                  <button type="button" onClick={() => { setEditing(g); setShowAdd(true); }} title="Editar"
                    style={{ background: "transparent", border: "none", color: B.sky, cursor: "pointer", fontSize: 12 }}>✏️</button>
                  {g.estado !== "anulado" && (
                    <button type="button" onClick={() => eliminar(g)} title="Anular"
                      style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <GastoServicioModal evento={evento} editing={editing} proveedores={proveedores} servicios={serviciosEvento}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Modal: crear/editar gasto ─────────────────────────────────────
function GastoServicioModal({ evento, editing, proveedores, servicios, onClose, onSaved }) {
  const isEdit = !!editing;
  const todayBog = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  // editing?.fecha puede venir como "2026-05-04T00:00:00+00:00" — el input
  // type=date solo acepta YYYY-MM-DD, así que rebanamos.
  const fechaInicial = editing?.fecha
    ? String(editing.fecha).slice(0, 10)
    : todayBog;
  const [f, setF] = useState({
    servicio_id:    editing?.servicio_id || "",
    concepto:       editing?.concepto || "",
    proveedor_id:   editing?.proveedor_id || "",
    proveedor_nombre: editing?.proveedor_nombre || "",
    monto:          editing?.monto || "",
    iva_pct:        editing?.iva_pct ?? 19,
    metodo_pago:    editing?.metodo_pago || "transferencia",
    fecha:          fechaInicial,
    factura_numero: editing?.factura_numero || "",
    notas:          editing?.notas || "",
    estado:         editing?.estado || "pendiente",
  });
  const [archivo, setArchivo] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const COPx = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

  const monto = Number(f.monto) || 0;
  const ivaMonto = monto * (Number(f.iva_pct) || 0) / 100;
  const total = monto + ivaMonto;

  const guardar = async () => {
    if (!f.concepto.trim()) return alert("Concepto requerido");
    if (monto <= 0) return alert("Monto inválido");
    setSaving(true);

    // Subir factura si hay archivo nuevo
    let factura_url = editing?.factura_url || null;
    if (archivo) {
      const ext = archivo.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${evento.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("facturas-servicios").upload(path, archivo, { contentType: archivo.type });
      if (upErr) { alert("No se pudo subir la factura: " + upErr.message); setSaving(false); return; }
      factura_url = path;
    }

    const proveedor = proveedores.find(p => p.id === f.proveedor_id);
    // serviciosEvento usa { key, descripcion, origen } — buscamos por key compuesta
    const servicio = servicios.find(s => s.key === f.servicio_id);
    const userEmail = (await supabase.auth.getUser()).data?.user?.email || "";

    // Sanitizar campos date/timestamp: Postgres rechaza "" — solo acepta
    // valor válido o null. Mismo bug que tuvimos en B2B visitas.
    const fechaClean = (f.fecha && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) ? f.fecha : todayBog;
    const payload = {
      evento_id: evento.id,
      servicio_id: f.servicio_id || null,
      servicio_descripcion: servicio?.descripcion || null,
      proveedor_id: f.proveedor_id || null,
      proveedor_nombre: proveedor?.nombre || f.proveedor_nombre.trim() || null,
      concepto: f.concepto.trim(),
      monto, iva_pct: Number(f.iva_pct) || 0, iva_monto: ivaMonto, total,
      metodo_pago: f.metodo_pago,
      fecha: fechaClean,
      factura_numero: f.factura_numero.trim() || null,
      factura_url,
      notas: f.notas.trim() || null,
      estado: f.estado,
      pagado_at: f.estado === "pagado" ? (editing?.pagado_at || new Date().toISOString()) : null,
      registrado_por: userEmail,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (isEdit) ({ error } = await supabase.from("eventos_servicios_gastos").update(payload).eq("id", editing.id));
    else        ({ error } = await supabase.from("eventos_servicios_gastos").insert(payload));
    setSaving(false);
    if (error) return alert("Error: " + error.message);
    onSaved();
  };

  const LS = { display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 };
  const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 16, padding: 22, maxWidth: 580, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{isEdit ? "Editar gasto" : "+ Nueva factura/gasto"}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>

        {/* Pregunta clara: ¿este gasto va a un servicio del evento? */}
        <div style={{ background: B.navyMid, borderRadius: 10, padding: 14, marginBottom: 14, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, marginBottom: 8 }}>
            ¿Está relacionado a algún servicio del evento?
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: f.servicio_id || f._asociar === false ? 10 : 0 }}>
            <button type="button" onClick={() => { set("_asociar", true); if (!f.servicio_id && servicios[0]) set("servicio_id", servicios[0].key); }}
              style={{ flex: 1, padding: "10px", borderRadius: 8,
                border: f.servicio_id || f._asociar === true ? `2px solid ${B.success}` : `1px solid ${B.navyLight}`,
                background: f.servicio_id || f._asociar === true ? B.success + "22" : B.navy,
                color: f.servicio_id || f._asociar === true ? B.success : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              ✓ Sí, vincular a un item de la cotización
            </button>
            <button type="button" onClick={() => { set("_asociar", false); set("servicio_id", ""); }}
              style={{ flex: 1, padding: "10px", borderRadius: 8,
                border: f._asociar === false && !f.servicio_id ? `2px solid ${B.warning}` : `1px solid ${B.navyLight}`,
                background: f._asociar === false && !f.servicio_id ? B.warning + "22" : B.navy,
                color: f._asociar === false && !f.servicio_id ? B.warning : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              No, gasto general del evento
            </button>
          </div>

          {/* Lista de items del evento agrupada por origen */}
          {(f.servicio_id || f._asociar === true) && (
            <>
              {servicios.length === 0 ? (
                <div style={{ padding: 10, fontSize: 11, color: B.warning, textAlign: "center", fontStyle: "italic" }}>
                  ⚠️ Este evento no tiene items en la cotización. Agregalos primero (tab Servicios o vía Cotización).
                </div>
              ) : (
                <div style={{ background: B.navy, borderRadius: 8, maxHeight: 280, overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
                  {Object.entries(servicios.reduce((acc, s) => {
                    if (!acc[s.origen]) acc[s.origen] = { color: s.origenColor, items: [] };
                    acc[s.origen].items.push(s);
                    return acc;
                  }, {})).map(([origen, grupo]) => (
                    <div key={origen}>
                      <div style={{ padding: "6px 12px", fontSize: 9, fontWeight: 700, color: grupo.color, textTransform: "uppercase", letterSpacing: "0.06em", background: grupo.color + "11", borderBottom: `1px solid ${B.navyLight}` }}>
                        {origen}
                      </div>
                      {grupo.items.map(s => {
                        const sel = f.servicio_id === s.key;
                        return (
                          <button key={s.key} type="button" onClick={() => set("servicio_id", s.key)}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px",
                              background: sel ? B.success + "22" : "transparent", border: "none",
                              borderBottom: `1px solid ${B.navyLight}`,
                              color: sel ? B.success : "#fff", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ fontSize: 14 }}>{sel ? "●" : "○"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.descripcion}
                              </div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                                Cobrado {COPx(s.cobrado)}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={LS}>Concepto *</label>
          <input value={f.concepto} onChange={e => set("concepto", e.target.value)} style={IS}
            placeholder="Ej: Anticipo DJ · Factura final decoración" autoFocus />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LS}>Proveedor</label>
            <select value={f.proveedor_id} onChange={e => set("proveedor_id", e.target.value)} style={IS}>
              <option value="">— Externo / no en lista —</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          {!f.proveedor_id && (
            <div>
              <label style={LS}>Nombre del proveedor</label>
              <input value={f.proveedor_nombre} onChange={e => set("proveedor_nombre", e.target.value)} style={IS} placeholder="Si no está arriba" />
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LS}>Monto base (sin IVA)</label>
            <input type="number" value={f.monto} onChange={e => set("monto", e.target.value)} style={IS} placeholder="0" />
          </div>
          <div>
            <label style={LS}>IVA %</label>
            <input type="number" value={f.iva_pct} onChange={e => set("iva_pct", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Total (auto)</label>
            <div style={{ ...IS, background: B.navy, color: B.sky, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16 }}>{COPx(total)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LS}>Fecha</label>
            <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Método pago</label>
            <select value={f.metodo_pago} onChange={e => set("metodo_pago", e.target.value)} style={IS}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label style={LS}>Factura #</label>
            <input value={f.factura_numero} onChange={e => set("factura_numero", e.target.value)} style={IS} placeholder="(opcional)" />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={LS}>Adjuntar factura (PDF, JPG, PNG)</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setArchivo(e.target.files?.[0] || null)}
            style={{ ...IS, padding: "8px 10px" }} />
          {editing?.factura_url && !archivo && (
            <div style={{ fontSize: 10, color: B.sky, marginTop: 4 }}>📎 Ya hay un archivo adjunto. Si no subís uno nuevo, queda el actual.</div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={LS}>Notas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} rows={2} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Estado</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { k: "pendiente", l: "Pendiente",  c: "#fbbf24" },
              { k: "pagado",    l: "Pagado",     c: "#22c55e" },
            ].map(e => (
              <button key={e.k} type="button" onClick={() => set("estado", e.k)}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: f.estado === e.k ? `2px solid ${e.c}` : `1px solid ${B.navyLight}`,
                  background: f.estado === e.k ? e.c + "22" : B.navyMid,
                  color: f.estado === e.k ? e.c : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {e.l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.navyLight, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={saving}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: B.success, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar gasto"}
          </button>
        </div>
      </div>
    </div>
  );
}
