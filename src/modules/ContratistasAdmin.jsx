// Panel admin del módulo Contratistas — Fase 5.
// Kanban + tabla + detalle + bitácora + acciones de workflow.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";
import { ContratistasWizardAsistido } from "./ContratistasPortal";
import { genRadicado } from "./contratistas/constants";
import KanbanCard from "./contratistas/admin/KanbanCard";
import DetailModal from "./contratistas/admin/DetailModal";

// Pipeline: contratistas en proceso (no aprobados aún ni vencidos)
const PIPELINE_COLUMNS = [
  { k: "borrador",    label: "Diligenciando", color: "rgba(255,255,255,0.55)", accent: "rgba(255,255,255,0.04)" },
  { k: "radicado",    label: "Radicados",    color: B.sky,     accent: "rgba(142,202,230,0.08)" },
  { k: "en_revision", label: "En revisión",  color: B.warning, accent: "rgba(232,160,32,0.08)"  },
  { k: "devuelto",    label: "Devueltos",    color: "#F97316", accent: "rgba(249,115,22,0.08)"  },
  { k: "rechazado",   label: "Rechazados",   color: B.danger,  accent: "rgba(214,69,69,0.08)"   },
];

const PIPELINE_ESTADOS = PIPELINE_COLUMNS.map(c => c.k);
const APROBADOS_ESTADOS = ["aprobado", "vencido"];
// EXPRESS: contratistas registrados inline en eventos.contratistas (JSON).
// No pasan por el pipeline formal — vienen con cédula+ARL básicos, listos
// para acceder al evento. Se muestran en su propio tab solo lectura.

const ESTADO_COLOR = {
  borrador: "rgba(255,255,255,0.3)",
  radicado: B.sky,
  en_revision: B.warning,
  devuelto: "#F97316",
  aprobado: B.success,
  rechazado: B.danger,
  activo: B.sand,
  cerrado: "rgba(255,255,255,0.4)",
  vencido: B.pink,
};

const ESTADO_LABEL = {
  borrador: "Borrador",
  radicado: "Radicado",
  en_revision: "En revisión",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  activo: "Activo",
  cerrado: "Cerrado",
  vencido: "Vencido",
};

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function isPilaVigente(fechaPila) {
  if (!fechaPila) return null;
  try {
    const diffDays = (Date.now() - new Date(fechaPila).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 45;
  } catch { return null; }
}

function exportCSV(filename, rows) {
  const csv = rows.map(row => row.map(c => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function ContratistasAdmin() {
  const { isMobile } = useBreakpoint();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pipeline"); // "pipeline" | "aprobados"
  const [view, setView] = useState("kanban"); // "kanban" | "table" (solo en pipeline)
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos"); // "todos" | "empresa" | "natural"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState("submitted_at");
  const [sortDir, setSortDir] = useState("desc");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [workerCounts, setWorkerCounts] = useState({}); // { contratista_id: count }
  const [activeWorkersCount, setActiveWorkersCount] = useState(0);
  const [ingresosByContratista, setIngresosByContratista] = useState({}); // { id: { count, last, permitidos, rechazados } }
  const [expressRows, setExpressRows] = useState([]); // contratistas flatten-eados de eventos.contratistas JSON
  const [promoting, setPromoting] = useState(false);   // estado de "creando ficha desde Express"
  const [verifyingKey, setVerifyingKey] = useState(""); // "evento_id:ctr_id:persona_idx" mientras sube archivo

  // Promueve un contratista Express (inline de eventos.contratistas) a la
  // tabla formal `contratistas` con estado="borrador" y abre la ficha
  // (DetailModal) para completar lo que falta desde Atolon OS — RUT, EPS,
  // ARL formal, fechas, declaraciones SST, firma, etc.
  //
  // Idempotente vía cédula/nombre: si ya existe una row para esta persona
  // (matched por nat_cedula o nombre_display + evento), reusa esa en lugar
  // de crear duplicado.
  const promoteExpressToFicha = async (r) => {
    if (promoting || !supabase) return;
    setPromoting(true);
    try {
      const personas = Array.isArray(r.personas) ? r.personas.filter(p => p?.nombre) : [];
      // Heurística: 1 persona o ninguna → natural; >1 → empresa.
      const tipoFormal = personas.length > 1 ? "empresa" : "natural";
      const persona0 = personas[0] || {};

      // Mapeo de campos del Express al schema formal:
      //   - r.contacto    = nombre del responsable (ej. "JOHANNA TURIZO") → emp_op_nombre
      //   - r.telefono    = teléfono real → emp_telefono + contacto_principal_cel
      //   - r.direccion   = dirección → emp_direccion
      //   - r.descripcion = descripción del servicio → servicio_desc (preferido sobre funcion)
      //   - r.rut_url     = PDF/imagen RUT → documento tipo="rut"
      //   - p.arl_url     = ARL de cada persona → documento tipo="arl"
      const telLooksEmail = !!r.telefono && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.telefono);
      const cel  = (!telLooksEmail && r.telefono) || null;
      const mail = telLooksEmail ? r.telefono : null;
      const servicio = r.descripcion || r.funcion || r.cargo || null;

      // Construir payload base con campos comunes
      const buildPayload = () => {
        const base = {
          nombre_display: r.nombre,
          servicio_desc:  servicio,
          contacto_principal_cel:   cel || "pendiente",
          contacto_principal_email: mail || "pendiente@atolon.co",
          num_trabajadores: tipoFormal === "empresa" ? personas.length : 1,
        };
        if (tipoFormal === "natural") {
          base.nat_nombre    = persona0.nombre || r.nombre;
          base.nat_cedula    = persona0.cedula || null;
          base.nat_fecha_nac = persona0.fecha_nacimiento || null;
          base.nat_celular   = cel;
          base.nat_correo    = mail;
        } else {
          base.emp_razon_social = r.nombre;
          base.emp_direccion    = r.direccion || null;
          base.emp_telefono     = cel;
          base.emp_op_nombre    = r.contacto || null;        // ahora SÍ es el rep
          base.emp_op_cargo     = r.cargo || null;
          base.emp_op_cel       = cel;
          base.emp_op_correo    = mail;
        }
        return base;
      };

      // 1) Buscar row ya existente (evitar duplicados al re-clickear)
      let existingId = null;
      if (tipoFormal === "natural" && persona0.cedula) {
        const { data: found } = await supabase
          .from("contratistas")
          .select("id")
          .eq("tipo", "natural")
          .eq("nat_cedula", String(persona0.cedula).trim())
          .limit(1).maybeSingle();
        if (found?.id) existingId = found.id;
      } else if (tipoFormal === "empresa" && r.nombre) {
        const { data: found } = await supabase
          .from("contratistas")
          .select("id")
          .eq("tipo", "empresa")
          .ilike("emp_razon_social", r.nombre.trim())
          .limit(1).maybeSingle();
        if (found?.id) existingId = found.id;
      }

      let contratistaId;
      if (existingId) {
        // 2a) ENRICH: traer row existente y completar SOLO los campos vacíos
        contratistaId = existingId;
        const { data: cur } = await supabase
          .from("contratistas")
          .select("*")
          .eq("id", existingId)
          .single();
        const updatePayload = {};
        const enrich = buildPayload();
        Object.entries(enrich).forEach(([k, v]) => {
          if (v == null || v === "" || v === "pendiente" || v === "pendiente@atolon.co") return;
          // Solo sobrescribir si el campo actual está vacío/pendiente (no pisar lo que el admin ya editó)
          const cv = cur?.[k];
          const empty = cv == null || cv === "" || cv === "pendiente" || cv === "pendiente@atolon.co";
          if (empty) updatePayload[k] = v;
        });
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from("contratistas").update(updatePayload).eq("id", existingId);
        }
      } else {
        // 2b) INSERT: nuevo borrador
        const payload = { ...buildPayload(), tipo: tipoFormal, estado: "borrador", radicado: genRadicado(tipoFormal) };
        const { data: row, error } = await supabase
          .from("contratistas")
          .insert(payload)
          .select("id")
          .single();
        if (error) { alert("No se pudo promover: " + error.message); return; }
        contratistaId = row.id;
      }

      // 3) Workers: si empresa, insertar las personas que no estén ya y
      //    enriquecer los existentes con campos vacíos (fecha_nacimiento, etc.)
      let workersInserted = [];
      if (tipoFormal === "empresa" && personas.length > 0) {
        const { data: existingWs } = await supabase
          .from("contratistas_trabajadores")
          .select("id, cedula, nombre, cargo, fecha_nacimiento")
          .eq("contratista_id", contratistaId);
        const existsByCed = new Map((existingWs || []).filter(w => w.cedula).map(w => [String(w.cedula).trim(), w]));
        workersInserted = [...(existingWs || [])];
        const toInsert = [];
        const toEnrich = []; // { id, payload }
        personas.forEach(p => {
          const ced = p.cedula ? String(p.cedula).trim() : null;
          const existing = ced ? existsByCed.get(ced) : null;
          if (existing) {
            // Enrich: solo setear campos que están vacíos en el row actual
            const upd = {};
            if (!existing.cargo            && p.rol)              upd.cargo = p.rol;
            if (!existing.fecha_nacimiento && p.fecha_nacimiento) upd.fecha_nacimiento = p.fecha_nacimiento;
            if (Object.keys(upd).length > 0) toEnrich.push({ id: existing.id, payload: upd });
            return;
          }
          toInsert.push({
            contratista_id: contratistaId,
            nombre: p.nombre,
            cedula: ced,
            cargo: p.rol || null,
            fecha_nacimiento: p.fecha_nacimiento || null,
          });
        });
        if (toInsert.length > 0) {
          const { data: ws, error: wErr } = await supabase
            .from("contratistas_trabajadores")
            .insert(toInsert)
            .select("id, cedula, nombre");
          if (wErr) {
            console.error("trabajadores insert failed", wErr, toInsert);
            alert("Error insertando trabajadores: " + wErr.message);
          }
          workersInserted = [...workersInserted, ...(ws || [])];
        }
        // Enrich existing workers (uno por uno para no overshadow campos)
        for (const t of toEnrich) {
          await supabase.from("contratistas_trabajadores").update(t.payload).eq("id", t.id);
        }
      }

      // 4) Documentos: RUT (a nivel contratista) + ARLs (por persona)
      const { data: existingDocs } = await supabase
        .from("contratistas_documentos")
        .select("tipo, trabajador_id, storage_path")
        .eq("contratista_id", contratistaId);
      const docsExisten = new Set((existingDocs || []).map(d => `${d.tipo}:${d.trabajador_id || "-"}:${d.storage_path}`));
      const docsToInsert = [];

      // RUT a nivel empresa (solo empresas)
      if (tipoFormal === "empresa" && r.rut_url) {
        const key = `rut:-:${r.rut_url}`;
        if (!docsExisten.has(key)) {
          docsToInsert.push({
            contratista_id: contratistaId,
            trabajador_id:  null,
            tipo: "rut",
            nombre_original: `RUT - ${r.nombre}.pdf`,
            storage_path: r.rut_url,
            validado: false,
          });
        }
      }

      // ARLs por persona
      personas.forEach((p, idx) => {
        if (!p.arl_url) return;
        let trabajadorId = null;
        if (tipoFormal === "empresa") {
          const ced = p.cedula ? String(p.cedula).trim() : null;
          const match = workersInserted.find(w =>
            (ced && String(w.cedula || "").trim() === ced) || (!ced && w.nombre === p.nombre)
          );
          trabajadorId = match?.id || null;
        }
        const key = `arl:${trabajadorId || "-"}:${p.arl_url}`;
        if (docsExisten.has(key)) return;
        docsToInsert.push({
          contratista_id: contratistaId,
          trabajador_id:  trabajadorId,
          tipo: "arl",
          nombre_original: `ARL - ${p.nombre || `Persona ${idx + 1}`}.${p.arl_url.split(".").pop() || "pdf"}`,
          storage_path: p.arl_url,
          validado: !!p.arl_verificado_url,
          validado_por: p.arl_verificado_by || null,
          validado_at:  p.arl_verificado_at  || null,
        });
      });
      if (docsToInsert.length > 0) {
        await supabase.from("contratistas_documentos").insert(docsToInsert);
      }

      // 5) Recargar y abrir la ficha
      await load();
      setDetailId(contratistaId);
    } finally {
      setPromoting(false);
    }
  };

  // Sube documento de verificación de ARL para UNA persona específica de un
  // contratista Express. Guarda url + timestamp + admin que verificó dentro
  // del JSON eventos.contratistas[<ctr>].personas[<i>] — eso queda como
  // "acceso autorizado" para esa persona.
  const uploadVerificacionArl = async (expressRow, personaIdx, file) => {
    if (!file || !supabase) return;
    const key = `${expressRow.evento_id}:${expressRow.id}:${personaIdx}`;
    setVerifyingKey(key);
    try {
      // 1) Subir archivo a storage
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `contratistas/verifications/${expressRow.evento_id}/${Date.now()}-${personaIdx}.${ext}`;
      const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { alert("Error subiendo verificación: " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("b2b-docs").getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) { alert("No se pudo obtener URL pública del archivo."); return; }

      // 2) Re-leer el evento (no asumir que expressRow.personas está fresco)
      const { data: ev } = await supabase.from("eventos").select("contratistas").eq("id", expressRow.evento_id).maybeSingle();
      const ctrs = Array.isArray(ev?.contratistas) ? ev.contratistas : [];
      // Encontrar la fila correspondiente (matchear por id que pusimos en el flatten)
      const ctrIdRaw = expressRow.id.startsWith("evt:") ? expressRow.id.split(":").slice(2).join(":") : expressRow.id;
      const updated = ctrs.map(c => {
        if ((c.id || c.nombre) !== ctrIdRaw) return c;
        const personas = Array.isArray(c.personas) ? [...c.personas] : [];
        if (!personas[personaIdx]) return c;
        personas[personaIdx] = {
          ...personas[personaIdx],
          arl_verificado_url: url,
          arl_verificado_at:  new Date().toISOString(),
          arl_verificado_by:  adminUser?.email || null,
        };
        return { ...c, personas };
      });
      const { error: updErr } = await supabase.from("eventos").update({ contratistas: updated }).eq("id", expressRow.evento_id);
      if (updErr) { alert("Error guardando verificación: " + updErr.message); return; }

      // 3) Recargar express rows
      await load();
    } finally {
      setVerifyingKey("");
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminUser(data?.user || null));
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contratistas")
      .select("id, radicado, tipo, estado, nombre_display, contacto_principal_email, contacto_principal_cel, fecha_inicio, fecha_fin, submitted_at, created_at, updated_at, num_trabajadores, emp_fecha_pila, nat_nombre, nat_cedula, nat_celular, nat_correo, nat_eps, nat_arl, nat_emerg_nombre, nat_emerg_tel, emp_razon_social, emp_nit, emp_rl_nombre, emp_rl_cedula, emp_rl_correo, emp_arl, emp_sst_nombre, servicio_desc, firma_nombre")
      .order("updated_at", { ascending: false, nullsFirst: false });
    if (error) console.error(error);
    const list = data || [];
    setRows(list);

    // Count trabajadores per contratista + activos totales
    const ids = list.map(r => r.id);
    if (ids.length) {
      const { data: ws } = await supabase
        .from("contratistas_trabajadores")
        .select("id, contratista_id, curso_completado")
        .in("contratista_id", ids);
      const counts = {};
      let active = 0;
      (ws || []).forEach(w => {
        counts[w.contratista_id] = (counts[w.contratista_id] || 0) + 1;
      });
      // Activos: trabajadores pertenecientes a contratistas aprobados
      const aprobadosIds = new Set(list.filter(r => r.estado === "aprobado").map(r => r.id));
      (ws || []).forEach(w => { if (aprobadosIds.has(w.contratista_id)) active++; });
      setWorkerCounts(counts);
      setActiveWorkersCount(active);

      // Ingresos de muelle por contratista (para vista Aprobados)
      const { data: ingresos } = await supabase
        .from("contratistas_ingresos_muelle")
        .select("contratista_id, resultado, created_at")
        .in("contratista_id", ids)
        .order("created_at", { ascending: false });
      const iMap = {};
      (ingresos || []).forEach(ing => {
        const k = ing.contratista_id;
        if (!k) return;
        if (!iMap[k]) iMap[k] = { count: 0, last: null, permitidos: 0, rechazados: 0, advertencias: 0 };
        iMap[k].count += 1;
        if (!iMap[k].last) iMap[k].last = ing.created_at;
        if (ing.resultado === "permitido") iMap[k].permitidos += 1;
        else if (ing.resultado === "rechazado") iMap[k].rechazados += 1;
        else if (ing.resultado === "advertencia") iMap[k].advertencias += 1;
      });
      setIngresosByContratista(iMap);
    } else {
      setWorkerCounts({});
      setActiveWorkersCount(0);
      setIngresosByContratista({});
    }

    // Express: contratistas inline en eventos.contratistas (JSON).
    // Carga eventos con array no vacío y aplana a filas individuales.
    const { data: evs } = await supabase
      .from("eventos")
      .select("id, nombre, fecha, contratistas")
      .not("contratistas", "is", null)
      .order("fecha", { ascending: false });
    const exp = [];
    (evs || []).forEach(e => {
      if (!Array.isArray(e.contratistas) || e.contratistas.length === 0) return;
      e.contratistas.forEach(c => {
        if (!c?.nombre) return;
        exp.push({
          id: `evt:${e.id}:${c.id || c.nombre}`,
          evento_id: e.id,
          evento_nombre: e.nombre,
          evento_fecha: e.fecha,
          nombre: c.nombre,
          tipo: c.tipo,            // "propio" | "externo"
          cargo: c.cargo,
          funcion: c.funcion,
          contacto: c.contacto,      // nombre del responsable (ej. JOHANNA TURIZO)
          telefono: c.telefono,      // teléfono real (separado del nombre)
          direccion: c.direccion,
          descripcion: c.descripcion,
          rut_url: c.rut_url,        // PDF/imagen del RUT (registro express)
          costo: c.costo,
          personas: c.personas || [],
          notas: c.notas,
        });
      });
    });
    setExpressRows(exp);

    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
    const allowedEstados = tab === "pipeline" ? PIPELINE_ESTADOS : APROBADOS_ESTADOS;
    return rows.filter(r => {
      if (!allowedEstados.includes(r.estado)) return false;
      if (tipoFilter !== "todos" && r.tipo !== tipoFilter) return false;
      if (q) {
        const hay = [r.radicado, r.nombre_display, r.contacto_principal_email, r.contacto_principal_cel]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
        if (!hay) return false;
      }
      const d = r.submitted_at || r.created_at;
      if (from && (!d || new Date(d) < from)) return false;
      if (to && (!d || new Date(d) > to)) return false;
      return true;
    });
  }, [rows, search, tipoFilter, dateFrom, dateTo, tab]);

  const byEstado = useMemo(() => {
    const g = {};
    PIPELINE_COLUMNS.forEach(c => { g[c.k] = []; });
    filtered.forEach(r => {
      if (g[r.estado]) g[r.estado].push(r);
    });
    return g;
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const pendientes = rows.filter(r => ["radicado", "en_revision"].includes(r.estado)).length;
    const aprobados = rows.filter(r => r.estado === "aprobado").length;
    const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const venceSemana = rows.filter(r => {
      if (r.estado !== "aprobado" || !r.fecha_fin) return false;
      const fin = new Date(r.fecha_fin).getTime();
      return fin > 0 && fin <= weekFromNow;
    }).length;
    return { pendientes, aprobados, venceSemana };
  }, [rows]);

  const tableRows = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      const na = va == null ? "" : va; const nb = vb == null ? "" : vb;
      if (na < nb) return sortDir === "asc" ? -1 : 1;
      if (na > nb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const downloadCSV = () => {
    const headers = ["Radicado", "Tipo", "Nombre", "Estado", "Email", "Celular", "Fecha inicio", "Fecha fin", "Submitted", "Trabajadores", "PILA vigente"];
    const body = filtered.map(r => [
      r.radicado, r.tipo, r.nombre_display, ESTADO_LABEL[r.estado] || r.estado,
      r.contacto_principal_email, r.contacto_principal_cel,
      r.fecha_inicio, r.fecha_fin,
      r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
      workerCounts[r.id] || 0,
      r.tipo === "empresa" ? (isPilaVigente(r.emp_fecha_pila) === true ? "Sí" : isPilaVigente(r.emp_fecha_pila) === false ? "No" : "—") : "—",
    ]);
    exportCSV(`contratistas_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...body]);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, color: B.white, margin: 0 }}>
            🦺 Contratistas
          </h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {rows.length} registros · SST · Decreto 1072/2015
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/contratistas" target="_blank" rel="noreferrer"
            style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", border: `1px solid ${B.sand}`, color: B.sand, fontSize: 11, fontWeight: 700, textDecoration: "none", cursor: "pointer", letterSpacing: 0.5 }}>
            🔗 Portal público
          </a>
          <button onClick={downloadCSV}
            style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", border: `1px solid ${B.sky}`, color: B.sky, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 }}>
            ⬇ CSV
          </button>
          <button onClick={() => setWizardOpen(true)}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5 }}>
            + Registro asistido
          </button>
        </div>
      </div>

      {/* Tab switcher Pipeline / Aprobados / Express */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${B.navyLight}`, maxWidth: 640 }}>
        {[
          { k: "pipeline",  label: "Pipeline", icon: "📥", count: rows.filter(r => PIPELINE_ESTADOS.includes(r.estado)).length, color: B.warning },
          { k: "aprobados", label: "Aprobados · Historial", icon: "✓", count: rows.filter(r => APROBADOS_ESTADOS.includes(r.estado)).length, color: B.success },
          { k: "express",   label: "Express · Eventos",    icon: "⚡", count: expressRows.length, color: B.sky },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{
              flex: 1, padding: "12px 14px",
              background: tab === t.k ? t.color : B.navyMid,
              color: tab === t.k ? B.navy : B.white,
              border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
              letterSpacing: 0.6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
            <span style={{ background: tab === t.k ? "rgba(13,27,62,0.15)" : "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
        {tab === "pipeline" ? (
          <>
            <Kpi label="Pendientes de revisión" value={kpis.pendientes} color={B.warning} />
            <Kpi label="Radicados" value={rows.filter(r => r.estado === "radicado").length} color={B.sky} />
            <Kpi label="Devueltos" value={rows.filter(r => r.estado === "devuelto").length} color="#F97316" />
            <Kpi label="Rechazados" value={rows.filter(r => r.estado === "rechazado").length} color={B.danger} />
          </>
        ) : (
          <>
            <Kpi label="Aprobados activos" value={kpis.aprobados} color={B.success} />
            <Kpi label="Trabajadores activos" value={activeWorkersCount} color={B.sky} />
            <Kpi label="Vencen esta semana" value={kpis.venceSemana} color={B.pink} />
            <Kpi label="Ingresos registrados" value={Object.values(ingresosByContratista).reduce((s, v) => s + v.count, 0)} color={B.sand} />
          </>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="🔍 Radicado, nombre, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: "1 1 240px", padding: "10px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}
        />
        <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none" }}>
          <option value="todos">Todos los tipos</option>
          <option value="empresa">Empresa</option>
          <option value="natural">Persona natural</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: "10px 10px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none", colorScheme: "dark" }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: "10px 10px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none", colorScheme: "dark" }} />

        {tab === "pipeline" && (
          <div style={{ display: "flex", gap: 0, marginLeft: "auto", borderRadius: 8, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
            <button onClick={() => setView("kanban")}
              style={{ padding: "10px 14px", background: view === "kanban" ? B.sky : B.navyMid, color: view === "kanban" ? B.navy : B.white, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" }}>
              ▦ Kanban
            </button>
            <button onClick={() => setView("table")}
              style={{ padding: "10px 14px", background: view === "table" ? B.sky : B.navyMid, color: view === "table" ? B.navy : B.white, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" }}>
              ☰ Tabla
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando…</div>
      ) : tab === "express" ? (
        expressRows.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}` }}>
            No hay contratistas Express registrados desde eventos.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {expressRows
              .filter(r => {
                const q = search.toLowerCase().trim();
                if (!q) return true;
                return [r.nombre, r.evento_nombre, r.contacto, r.cargo].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
              })
              .map(r => (
              <div key={r.id} onClick={() => promoteExpressToFicha(r)} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${r.tipo === "propio" ? B.sky : B.sand}`, cursor: promoting ? "wait" : "pointer", opacity: promoting ? 0.6 : 1, transition: "background 0.15s" }}
                onMouseEnter={e => { if (!promoting) e.currentTarget.style.background = B.navyLight; }}
                onMouseLeave={e => { if (!promoting) e.currentTarget.style.background = B.navyMid; }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: r.tipo === "propio" ? B.sky : B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  ⚡ EXPRESS · {r.tipo === "propio" ? "🏷️ Propio" : "🤝 Externo"}{r.cargo ? ` · ${r.cargo}` : ""}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: B.white, marginBottom: 6 }}>{r.nombre}</div>
                <div style={{ fontSize: 11, color: B.sand, background: "rgba(200,185,154,0.1)", border: `1px solid ${B.sand}33`, borderRadius: 6, padding: "5px 8px", marginBottom: 8, display: "inline-block" }}>
                  🎫 {r.evento_nombre || "Evento sin nombre"}{r.evento_fecha ? ` · ${fmt(r.evento_fecha)}` : ""}
                </div>
                {r.funcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 6, lineHeight: 1.4 }}>🎯 {r.funcion}</div>}
                {r.contacto && <div style={{ fontSize: 12, color: B.sky, marginBottom: 4 }}>📞 {r.contacto}</div>}
                {(r.personas || []).length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}` }}>
                    <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
                      👥 Personal ({r.personas.length})
                    </div>
                    {r.personas.map((p, i) => {
                      const vKey = `${r.evento_id}:${r.id}:${i}`;
                      const verifying = verifyingKey === vKey;
                      const verified = !!p.arl_verificado_url;
                      return (
                        <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", padding: "5px 0", borderTop: i > 0 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                            <span style={{ flex: 1 }}>{p.nombre}</span>
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>{p.cedula || ""}{p.rol ? ` · ${p.rol}` : ""}</span>
                            {p.arl_url && (
                              <a href={p.arl_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                title="ARL adjuntada por el organizador del evento"
                                style={{ color: B.success, textDecoration: "none", fontSize: 10, fontWeight: 700, border: `1px solid ${B.success}55`, borderRadius: 5, padding: "1px 6px" }}>
                                ARL ✓
                              </a>
                            )}
                          </div>
                          {/* Verificación admin — controla acceso a Atolon para esta persona */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                            {verified ? (
                              <>
                                <a href={p.arl_verificado_url} target="_blank" rel="noreferrer"
                                  title={`Verificada por ${p.arl_verificado_by || "admin"} el ${p.arl_verificado_at ? fmt(p.arl_verificado_at) : "—"}`}
                                  style={{ flex: 1, fontSize: 10, fontWeight: 800, color: B.success, background: B.success + "18", border: `1px solid ${B.success}55`, borderRadius: 5, padding: "3px 8px", textAlign: "center", textDecoration: "none" }}>
                                  ✓ Verificada · Acceso autorizado
                                </a>
                              </>
                            ) : (
                              <label style={{ flex: 1, fontSize: 10, fontWeight: 700, color: B.sand, background: B.navy, border: `1px dashed ${B.sand}55`, borderRadius: 5, padding: "3px 8px", textAlign: "center", cursor: verifying ? "wait" : "pointer", display: "block" }}>
                                {verifying ? "Subiendo…" : "📎 Verificar ARL"}
                                <input type="file" accept="image/*,application/pdf" style={{ display: "none" }}
                                  disabled={verifying}
                                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadVerificacionArl(r, i, f); e.target.value = ""; }} />
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${B.navyLight}` }}>
                  <button onClick={(e) => { e.stopPropagation(); promoteExpressToFicha(r); }}
                    disabled={promoting}
                    style={{ background: B.success, border: "none", color: B.white, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: promoting ? "wait" : "pointer", flex: 1, opacity: promoting ? 0.6 : 1 }}>
                    {promoting ? "Abriendo ficha…" : "✓ Abrir ficha y completar"}
                  </button>
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { module: "eventos", openEventoId: r.evento_id } })); }}
                    style={{ fontSize: 11, color: B.sky, textDecoration: "none", fontWeight: 700, padding: "6px 12px", border: `1px solid ${B.sky}55`, borderRadius: 6, alignSelf: "center" }}>
                    Ver en evento →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}` }}>
          {rows.length === 0 ? "Aún no hay contratistas registrados." : "Sin coincidencias con los filtros."}
        </div>
      ) : tab === "pipeline" && view === "kanban" ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}>
          {PIPELINE_COLUMNS.map(col => (
            <div key={col.k} style={{ background: col.accent, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: 10, minHeight: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${B.navyLight}` }}>
                <div style={{ color: col.color, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                  {col.label}
                </div>
                <div style={{ background: col.color + "22", color: col.color, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>
                  {byEstado[col.k]?.length || 0}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(byEstado[col.k] || []).map(r => (
                  <KanbanCard key={r.id} c={{ ...r, num_trabajadores: r.num_trabajadores || workerCounts[r.id] }} onClick={() => setDetailId(r.id)} />
                ))}
                {(byEstado[col.k] || []).length === 0 && (
                  <div style={{ padding: 14, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 11, fontStyle: "italic" }}>
                    —
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "aprobados" ? (
        <AprobadosTable
          rows={tableRows}
          workerCounts={workerCounts}
          ingresosByContratista={ingresosByContratista}
          onOpen={setDetailId}
          isPilaVigente={isPilaVigente}
        />
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ background: B.navyLight }}>
                {[
                  { k: "radicado", label: "Radicado" },
                  { k: "tipo", label: "Tipo" },
                  { k: "nombre_display", label: "Nombre" },
                  { k: "estado", label: "Estado" },
                  { k: "submitted_at", label: "Radicado" },
                  { k: "num_trabajadores", label: "# Trab." },
                  { k: "fecha_fin", label: "Fin servicio" },
                  { k: "emp_fecha_pila", label: "PILA" },
                ].map(h => (
                  <th key={h.k}
                    onClick={() => toggleSort(h.k)}
                    style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>
                    {h.label} {sortKey === h.k && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => {
                const pila = r.tipo === "empresa" ? isPilaVigente(r.emp_fecha_pila) : null;
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)}
                    style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: B.sand }}>{r.radicado}</td>
                    <td style={{ padding: "12px 14px", fontSize: 11 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, background: (r.tipo === "empresa" ? B.sky : B.pink) + "22", color: r.tipo === "empresa" ? B.sky : B.pink, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                        {r.tipo === "empresa" ? "Empresa" : "Natural"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: B.white }}>{r.nombre_display}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 12, background: (ESTADO_COLOR[r.estado] || B.sand) + "22", color: ESTADO_COLOR[r.estado] || B.sand, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                        {ESTADO_LABEL[r.estado] || r.estado}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{fmt(r.submitted_at)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: B.sand }}>{workerCounts[r.id] || (r.tipo === "natural" ? 1 : 0)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{fmt(r.fecha_fin)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 11 }}>
                      {pila === null ? <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span> :
                        <span style={{ color: pila ? B.success : B.danger, fontWeight: 700 }}>
                          {pila ? "✓" : "⚠"}
                        </span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer legal */}
      <div style={{ marginTop: 20, padding: "14px 18px", background: "rgba(200,185,154,0.05)", borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
        📜 Marco legal: <strong>Decreto 1072/2015 Art. 2.2.4.6.28</strong> · <strong>CST Art. 34</strong> · <strong>Decreto 723/2013</strong> · <strong>Ley 527/1999</strong> (firma electrónica)
      </div>

      {/* Wizard asistido */}
      {wizardOpen && (
        <ContratistasWizardAsistido
          adminUser={adminUser}
          onClose={() => { setWizardOpen(false); load(); }}
        />
      )}

      {/* Detail modal */}
      {detailId && (
        <DetailModal
          contratistaId={detailId}
          adminUser={adminUser}
          onClose={() => { setDetailId(null); }}
          onChanged={() => { load(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: B.navyMid, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function AprobadosTable({ rows, workerCounts, ingresosByContratista, onOpen, isPilaVigente }) {
  const fmtDateTime = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  };
  const diasDesde = (d) => {
    if (!d) return null;
    try { return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)); } catch { return null; }
  };

  if (rows.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}` }}>
        Sin contratistas aprobados con los filtros actuales.
      </div>
    );
  }

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1000 }}>
        <thead>
          <tr style={{ background: B.navyLight }}>
            {["Radicado", "Tipo", "Nombre", "Estado", "Aprobado", "Trabajadores", "Ingresos totales", "Último ingreso", "PILA", "Curso SST"].map((h, i) => (
              <th key={i} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const ing = ingresosByContratista[r.id] || { count: 0, last: null, permitidos: 0, rechazados: 0, advertencias: 0 };
            const pila = r.tipo === "empresa" ? isPilaVigente(r.emp_fecha_pila) : null;
            const workers = workerCounts[r.id] || (r.tipo === "natural" ? 1 : 0);
            const dias = diasDesde(ing.last);
            const isVencido = r.estado === "vencido";
            return (
              <tr key={r.id} onClick={() => onOpen(r.id)}
                style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", opacity: isVencido ? 0.6 : 1 }}
                onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: B.sand }}>{r.radicado}</td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 10, background: (r.tipo === "empresa" ? B.sky : B.pink) + "22", color: r.tipo === "empresa" ? B.sky : B.pink, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                    {r.tipo === "empresa" ? "Empresa" : "Natural"}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: B.white }}>{r.nombre_display}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 12,
                    background: (isVencido ? B.pink : B.success) + "22",
                    color: isVencido ? B.pink : B.success,
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                  }}>
                    {isVencido ? "Vencido" : "Aprobado"}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontSize: 12 }}>
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 12, color: B.sand, textAlign: "center" }}>{workers}</td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: ing.count > 0 ? B.success : "rgba(255,255,255,0.3)" }}>
                    {ing.count}
                  </div>
                  {ing.count > 0 && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      ✓ {ing.permitidos}
                      {ing.rechazados > 0 && <span style={{ color: B.danger, marginLeft: 6 }}>✗ {ing.rechazados}</span>}
                      {ing.advertencias > 0 && <span style={{ color: B.warning, marginLeft: 6 }}>⚠ {ing.advertencias}</span>}
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  {ing.last ? (
                    <>
                      <div>{fmtDateTime(ing.last)}</div>
                      <div style={{ fontSize: 10, color: dias === 0 ? B.success : dias <= 7 ? B.sky : "rgba(255,255,255,0.4)", marginTop: 2 }}>
                        {dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`}
                      </div>
                    </>
                  ) : <span style={{ color: "rgba(255,255,255,0.3)" }}>Nunca</span>}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  {pila === null ? <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span> :
                    <span style={{ color: pila ? B.success : B.danger, fontWeight: 700 }}>
                      {pila ? "✓ Vigente" : "⚠ Vencida"}
                    </span>
                  }
                </td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  <CursoStatus contratistaId={r.id} totalWorkers={workers} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CursoStatus({ contratistaId, totalWorkers }) {
  const [done, setDone] = useState(null);
  useEffect(() => {
    let cancel = false;
    supabase.from("contratistas_trabajadores")
      .select("curso_completado")
      .eq("contratista_id", contratistaId)
      .then(({ data }) => {
        if (cancel) return;
        const completados = (data || []).filter(w => w.curso_completado).length;
        setDone(completados);
      });
    return () => { cancel = true; };
  }, [contratistaId]);
  if (done === null) return <span style={{ color: "rgba(255,255,255,0.3)" }}>…</span>;
  const all = totalWorkers > 0 && done === totalWorkers;
  return (
    <span style={{ color: all ? B.success : done === 0 ? B.danger : B.warning, fontWeight: 700 }}>
      {done} / {totalWorkers}
    </span>
  );
}
