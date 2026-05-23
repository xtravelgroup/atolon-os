/**
 * availability-engine — single source of truth para disponibilidad de pasadía.
 * Consumido por Reservas.jsx, Tatiana, Partner API, Cloudbeds (futuro).
 *
 * Replica la misma lógica que la página de booking:
 *   - tabla `salidas` (activo=true) con capacidad_total
 *   - tabla `cierres` (tipo=total cierra el día, salidas[] cierra puntuales)
 *   - tabla `salidas_override` por fecha (accion=abrir|cerrar)
 *   - tabla `eventos` con comparte_lancha_pasadias=true (suman al cupo)
 *   - tabla `reservas` no canceladas (cuentan contra el cupo)
 *   - Auto-apertura en cascada: salidas con auto_apertura=true solo se
 *     abren cuando la anterior llega a su auto_umbral% (default 75%)
 *
 * Endpoints:
 *   POST /availability-engine/check    body: { fecha, num_personas } → estado
 *   POST /availability-engine/by-month body: { year, month, num_personas } → mapa por día
 *   GET  /availability-engine/diag     ping
 *
 * Tatiana ya usa esta lógica inline en tatiana-chat/index.ts. Cuando este
 * endpoint esté validado en producción, Tatiana puede llamar acá vía fetch
 * y se elimina la duplicación.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

let _SB: any = null;
function getSB() {
  if (_SB) return _SB;
  _SB = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return _SB;
}

function formatHora(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora || "");
  if (!m) return hora;
  const h = parseInt(m[1], 10);
  const mm = m[2];
  if (h === 0)  return `12:${mm} AM`;
  if (h < 12)   return `${h}:${mm} AM`;
  if (h === 12) return `12:${mm} PM`;
  return `${h - 12}:${mm} PM`;
}

interface CheckInput {
  fecha: string;        // YYYY-MM-DD
  num_personas: number;
}

interface DetailedCheckInput {
  fecha: string;
  exclude_reserva_id?: string;  // útil cuando edits: no contarse contra cupo
  client_view?: boolean;        // si true, aplica cutoff 45 min antes de salida (booking público)
}

interface MonthCheckInput {
  year: number;
  month: number;  // 1-12
  // Si true, aplica reglas client-safe: cutoff 45min antes de salida hoy.
  client_view?: boolean;
}

interface SalidaOpcion {
  salida_id: string;
  hora: string;
  hora_display: string;
  cupos_restantes: number;
  suficiente: boolean;
}

async function checkDisponibilidad(input: CheckInput) {
  const SB = getSB();
  const { fecha, num_personas } = input;

  const [salidasR, cierresR, overridesR, reservasR, eventosR] = await Promise.all([
    SB.from("salidas")
      .select("id, hora, capacidad_total, activo, auto_apertura, auto_umbral")
      .eq("activo", true)
      .order("hora"),
    SB.from("cierres")
      .select("tipo, salidas, activo, motivo")
      .eq("fecha", fecha)
      .eq("activo", true),
    SB.from("salidas_override")
      .select("salida_id, accion, extra_embarcaciones")
      .eq("fecha", fecha),
    SB.from("reservas")
      .select("id, pax, salida_id, estado, grupo_id")
      .eq("fecha", fecha)
      .neq("estado", "cancelado"),
    SB.from("eventos")
      .select("id, pax, pasadias_org, comparte_lancha_pasadias, salida_compartida_id, salidas_grupo, stage")
      .eq("fecha", fecha)
      .eq("stage", "Confirmado"),
  ]);

  const salidasActivas = (salidasR.data || []) as any[];
  const cierres        = (cierresR.data  || []) as any[];
  const overrides      = (overridesR.data || []) as any[];
  const reservasDia    = (reservasR.data || []) as any[];
  const eventosDia     = (eventosR.data  || []) as any[];

  // Cierre total
  if (cierres.some((c) => c.tipo === "total")) {
    return {
      fecha,
      num_personas,
      hay_disponibilidad: false,
      motivo: "dia_cerrado_total",
      opciones: [],
    };
  }

  const salidasCerradas = new Set<string>();
  for (const c of cierres) {
    for (const sid of (c.salidas || [])) salidasCerradas.add(sid);
  }

  const overrideMap: Record<string, any> = {};
  for (const o of overrides) overrideMap[o.salida_id] = o;

  const ocupacion: Record<string, number> = {};
  const paxIndivGrupo: Record<string, Record<string, number>> = {};
  for (const r of reservasDia) {
    if (!r.salida_id) continue;
    ocupacion[r.salida_id] = (ocupacion[r.salida_id] || 0) + (r.pax || 0);
    if (r.grupo_id) {
      if (!paxIndivGrupo[r.grupo_id]) paxIndivGrupo[r.grupo_id] = {};
      paxIndivGrupo[r.grupo_id][r.salida_id] = (paxIndivGrupo[r.grupo_id][r.salida_id] || 0) + (r.pax || 0);
    }
  }
  for (const g of eventosDia) {
    const bulkTotal = ((g.pasadias_org || [])
      .filter((p: any) => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF")
      .reduce((s: number, p: any) => s + (Number(p.personas) || 0), 0)) || g.pax || 0;
    if (bulkTotal <= 0) continue;
    const targets = new Set<string>();
    if (g.salida_compartida_id) targets.add(g.salida_compartida_id);
    for (const sg of (g.salidas_grupo || [])) {
      if (sg?.id) targets.add(sg.id);
    }
    if (targets.size === 0) continue;
    const indivMap = paxIndivGrupo[g.id] || {};
    if (targets.size === 1) {
      const sid = Array.from(targets)[0];
      const yaIndiv = indivMap[sid] || 0;
      ocupacion[sid] = (ocupacion[sid] || 0) + Math.max(0, bulkTotal - yaIndiv);
    } else {
      const pesos = (g.salidas_grupo || [])
        .map((sg: any) => ({ sid: sg?.id, peso: Number(sg?.personas) || 0 }))
        .filter((x: any) => x.sid && targets.has(x.sid));
      const totalPeso = pesos.reduce((s: number, x: any) => s + x.peso, 0);
      if (totalPeso > 0) {
        for (const { sid, peso } of pesos) {
          const aporteBruto = Math.round(bulkTotal * peso / totalPeso);
          ocupacion[sid] = (ocupacion[sid] || 0) + Math.max(0, aporteBruto - (indivMap[sid] || 0));
        }
      } else {
        const tgArr = Array.from(targets);
        const por = Math.floor(bulkTotal / tgArr.length);
        for (const sid of tgArr) {
          ocupacion[sid] = (ocupacion[sid] || 0) + Math.max(0, por - (indivMap[sid] || 0));
        }
      }
    }
  }

  const sortedSalidas = [...salidasActivas].sort((a, b) =>
    (a.hora || "").localeCompare(b.hora || ""),
  );

  const capOf = (s: any) => {
    const ovr = overrideMap[s.id];
    const extra = (ovr?.extra_embarcaciones || []).reduce(
      (sum: number, e: any) => sum + (Number(e.capacidad) || 0), 0,
    );
    return (s.capacidad_total || 0) + extra;
  };
  const visibles = sortedSalidas.filter((s, idx) => {
    const ovr = overrideMap[s.id];
    if (ovr?.accion === "abrir")  return true;
    if (ovr?.accion === "cerrar") return false;
    if (salidasCerradas.has(s.id)) return false;
    if (!s.auto_apertura) return true;
    if (idx === 0) return true;
    const prev = sortedSalidas[idx - 1];
    const prevPct = (ocupacion[prev.id] || 0) / (capOf(prev) || 1);
    return prevPct >= ((prev.auto_umbral || 75) / 100);
  });

  const opciones: SalidaOpcion[] = visibles.map((s) => {
    const cap = capOf(s);
    const pax = ocupacion[s.id] || 0;
    const cupos = Math.max(0, cap - pax);
    return {
      salida_id: s.id,
      hora: s.hora,
      hora_display: formatHora(s.hora),
      cupos_restantes: cupos,
      suficiente: cupos >= num_personas,
    };
  });

  const conCupo = opciones.filter((o) => o.suficiente);

  return {
    fecha,
    num_personas,
    hay_disponibilidad: conCupo.length > 0,
    opciones,
    horarios_disponibles: conCupo.map((o) => o.hora_display),
  };
}

// ── Versión detallada para uso admin ───────────────────────────────────
// Devuelve toda la info que Reservas.jsx (admin) necesita para renderizar
// el form: pax actual por salida, motivo de cierre si aplica, overrides
// aplicados con extra_embarcaciones (capacidad ampliada manualmente).
// Helper: minutos transcurridos hoy en zona Bogotá (UTC-5).
// Se usa para el cutoff "no vender salidas cercanas" en client_view.
function bogotaNowMinutes(): number {
  const t = new Date().toLocaleString("en-US", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function bogotaTodayIso(): string {
  const d = new Date();
  // toLocaleString con timeZone produce "5/10/2026, ..." → reformateamos a YYYY-MM-DD
  const fmt = d.toLocaleString("en-CA", { timeZone: "America/Bogota" });
  return fmt.slice(0, 10);
}

async function checkDisponibilidadDetailed(input: DetailedCheckInput) {
  const SB = getSB();
  const { fecha, exclude_reserva_id, client_view } = input;
  const isToday = client_view && fecha === bogotaTodayIso();
  const nowMins = isToday ? bogotaNowMinutes() : -1;

  const [salidasR, cierresR, overridesR, reservasR, eventosR] = await Promise.all([
    SB.from("salidas")
      .select("id, hora, hora_regreso, capacidad_total, activo, auto_apertura, auto_umbral, nombre, embarcaciones")
      .eq("activo", true)
      .order("hora"),
    SB.from("cierres")
      .select("tipo, salidas, activo, motivo, mensaje_publico")
      .eq("fecha", fecha)
      .eq("activo", true),
    SB.from("salidas_override")
      .select("salida_id, accion, extra_embarcaciones")
      .eq("fecha", fecha),
    (() => {
      let q = SB.from("reservas")
        .select("id, pax, salida_id, estado, nombre, grupo_id")
        .eq("fecha", fecha)
        .neq("estado", "cancelado");
      if (exclude_reserva_id) q = q.neq("id", exclude_reserva_id);
      return q;
    })(),
    // Eventos del día: traemos TODOS los grupos confirmados (no sólo los
    // que comparten lancha) — pueden tener salidas_grupo apuntando a una
    // salida específica, y su bulk pesa en la ocupación de esa salida.
    SB.from("eventos")
      .select("id, pax, nombre, pasadias_org, comparte_lancha_pasadias, salida_compartida_id, salidas_grupo, categoria, stage")
      .eq("fecha", fecha)
      .eq("stage", "Confirmado"),
  ]);

  const salidas    = (salidasR.data    || []) as any[];
  const cierres    = (cierresR.data    || []) as any[];
  const overrides  = (overridesR.data  || []) as any[];
  const reservas   = (reservasR.data   || []) as any[];
  const eventos    = (eventosR.data    || []) as any[];

  const cierreTotal = cierres.find((c) => c.tipo === "total");
  const cierresParciales = new Set<string>();
  for (const c of cierres) {
    if (c.tipo !== "total") {
      for (const sid of (c.salidas || [])) cierresParciales.add(sid);
    }
  }

  const overrideMap: Record<string, any> = {};
  for (const o of overrides) overrideMap[o.salida_id] = o;

  // Ocupación por salida. La calculamos en 2 pasos:
  //
  // 1) Reservas individuales con salida_id (cada persona física en lancha)
  // 2) Aporte del BULK de cada grupo a las salidas que tenga asignadas
  //    (salida_compartida_id O salidas_grupo[].id). Descontamos las
  //    reservas con grupo_id apuntando al grupo ya contadas en (1) — son
  //    "individuales dentro del grupo", parte del mismo bulk.
  const ocupacion: Record<string, number> = {};
  // Pax individuales con grupo_id asignado a cada salida — para descontar
  // del bulk del grupo y no doble-contar.
  const paxIndivGrupoEnSalida: Record<string, Record<string, number>> = {}; // {grupoId:{salidaId:pax}}
  for (const r of reservas) {
    if (!r.salida_id) continue;
    ocupacion[r.salida_id] = (ocupacion[r.salida_id] || 0) + (r.pax || 0);
    if (r.grupo_id) {
      if (!paxIndivGrupoEnSalida[r.grupo_id]) paxIndivGrupoEnSalida[r.grupo_id] = {};
      paxIndivGrupoEnSalida[r.grupo_id][r.salida_id] =
        (paxIndivGrupoEnSalida[r.grupo_id][r.salida_id] || 0) + (r.pax || 0);
    }
  }
  for (const g of eventos) {
    const bulkTotal = ((g.pasadias_org || [])
      .filter((p: any) => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF")
      .reduce((s: number, p: any) => s + (Number(p.personas) || 0), 0)) || g.pax || 0;
    if (bulkTotal <= 0) continue;

    // Salidas a las que apunta el grupo (compartida + salidas_grupo)
    const targets = new Set<string>();
    if (g.salida_compartida_id) targets.add(g.salida_compartida_id);
    for (const sg of (g.salidas_grupo || [])) {
      if (sg?.id) targets.add(sg.id);
    }
    if (targets.size === 0) continue;

    const indivPorSalida = paxIndivGrupoEnSalida[g.id] || {};

    if (targets.size === 1) {
      const sid = Array.from(targets)[0];
      const yaIndiv = indivPorSalida[sid] || 0;
      const aporte = Math.max(0, bulkTotal - yaIndiv);
      ocupacion[sid] = (ocupacion[sid] || 0) + aporte;
    } else {
      // Reparto proporcional a "personas" en salidas_grupo
      const pesos = (g.salidas_grupo || [])
        .map((sg: any) => ({ sid: sg?.id, peso: Number(sg?.personas) || 0 }))
        .filter((x: any) => x.sid && targets.has(x.sid));
      const totalPeso = pesos.reduce((s: number, x: any) => s + x.peso, 0);
      if (totalPeso > 0) {
        for (const { sid, peso } of pesos) {
          const aporteBruto = Math.round(bulkTotal * peso / totalPeso);
          const yaIndiv = indivPorSalida[sid] || 0;
          const aporte = Math.max(0, aporteBruto - yaIndiv);
          ocupacion[sid] = (ocupacion[sid] || 0) + aporte;
        }
      } else {
        // Sin pesos: reparto equitativo
        const tgArr = Array.from(targets);
        const por = Math.floor(bulkTotal / tgArr.length);
        for (const sid of tgArr) {
          const yaIndiv = indivPorSalida[sid] || 0;
          const aporte = Math.max(0, por - yaIndiv);
          ocupacion[sid] = (ocupacion[sid] || 0) + aporte;
        }
      }
    }
  }

  const sortedSalidas = [...salidas].sort((a, b) =>
    (a.hora || "").localeCompare(b.hora || ""),
  );

  const opciones = sortedSalidas.map((s, idx) => {
    const ovr = overrideMap[s.id];
    const extraCap = (ovr?.extra_embarcaciones || []).reduce(
      (sum: number, e: any) => sum + (Number(e.capacidad) || 0), 0,
    );
    const cap = (s.capacidad_total || 0) + extraCap;
    const pax = ocupacion[s.id] || 0;

    let visible = true;
    let razon_oculta: string | null = null;
    if (ovr?.accion === "abrir") {
      visible = true;
    } else if (ovr?.accion === "cerrar") {
      visible = false; razon_oculta = "override_cerrar";
    } else if (cierresParciales.has(s.id)) {
      visible = false; razon_oculta = "cierre_parcial";
    } else if (s.auto_apertura && idx > 0) {
      const prev = sortedSalidas[idx - 1];
      // Capacidad de la salida previa = base + extra del override
      const prevOvr = overrideMap[prev.id];
      const prevExtra = (prevOvr?.extra_embarcaciones || []).reduce(
        (sum: number, e: any) => sum + (Number(e.capacidad) || 0), 0,
      );
      const prevCap = (prev.capacidad_total || 0) + prevExtra;
      const prevPct = (ocupacion[prev.id] || 0) / (prevCap || 1);
      if (prevPct < ((prev.auto_umbral || 75) / 100)) {
        visible = false; razon_oculta = "auto_apertura_pendiente";
      }
    }

    // Client-view cutoff: 45 min antes de la hora de salida cuando es hoy.
    // Evita que un cliente self-service reserve para una salida que ya zarpó
    // o que está demasiado cerca para llegar al muelle. Admin (sin client_view)
    // sigue viendo todas las salidas — puede confirmar manualmente walk-ins.
    if (visible && isToday && s.hora) {
      const [h, mm] = String(s.hora).split(":").map(Number);
      const minsSalida = h * 60 + mm;
      if (nowMins >= minsSalida - 45) {
        visible = false;
        razon_oculta = "cutoff_45min";
      }
    }

    return {
      salida_id: s.id,
      hora: s.hora,
      hora_regreso: s.hora_regreso,
      hora_display: formatHora(s.hora),
      nombre: s.nombre,
      capacidad_base: s.capacidad_total || 0,
      capacidad_extra: extraCap,
      capacidad_total: cap,
      pax_reservados: pax,
      cupos_restantes: Math.max(0, cap - pax),
      visible,
      razon_oculta,
      override: ovr || null,
    };
  });

  return {
    fecha,
    exclude_reserva_id: exclude_reserva_id || null,
    cierre_total: cierreTotal
      ? { motivo: cierreTotal.motivo, mensaje_publico: cierreTotal.mensaje_publico }
      : null,
    opciones,
  };
}

// ── Vista mensual: disponibilidad por día (para calendarios) ────────────
// NO existe "capacidad por día" — la disponibilidad la define la lancha de cada salida.
// Para cada día devolvemos las salidas que estarían abiertas y sus cupos individuales.
// El consumer (booking widget / agencia) usa max(cupos_por_salida) para decidir si
// el grupo solicitado cabe en alguna salida.
//
// Ej: /check-month body: { year: 2026, month: 6 } →
//   "2026-06-01": {
//     abierto: true,                     // alguna salida tiene cupo > 0
//     cupos_max_salida: 20,              // cupos en la mejor salida (decide si grupo cabe)
//     cupos_total: 62,                   // suma informativa, NO usar para decisión
//     salidas: [
//       { salida_id: "S1", hora: "08:30", capacidad: 20, pax: 11, cupos: 9 },
//       ...
//     ]
//   }
async function checkDisponibilidadMonth(input: MonthCheckInput) {
  const SB = getSB();
  const { year, month } = input;
  const daysInMonth = new Date(year, month, 0).getDate();
  const fromIso = `${year}-${String(month).padStart(2,"0")}-01`;
  const toIso   = `${year}-${String(month).padStart(2,"0")}-${String(daysInMonth).padStart(2,"0")}`;

  const [salidasR, cierresR, overridesR, reservasR, eventosR] = await Promise.all([
    SB.from("salidas")
      .select("id, hora, capacidad_total, activo, auto_apertura, auto_umbral")
      .eq("activo", true)
      .order("hora"),
    SB.from("cierres")
      .select("fecha, tipo, salidas, activo")
      .eq("activo", true)
      .gte("fecha", fromIso).lte("fecha", toIso),
    SB.from("salidas_override")
      .select("fecha, salida_id, accion, extra_embarcaciones")
      .gte("fecha", fromIso).lte("fecha", toIso),
    SB.from("reservas")
      .select("id, fecha, pax, salida_id, grupo_id")
      .neq("estado", "cancelado")
      .gte("fecha", fromIso).lte("fecha", toIso),
    SB.from("eventos")
      .select("id, fecha, pax, pasadias_org, comparte_lancha_pasadias, salida_compartida_id, salidas_grupo, stage")
      .gte("fecha", fromIso).lte("fecha", toIso)
      .eq("stage", "Confirmado"),
  ]);

  const salidas   = (salidasR.data   || []) as any[];
  const cierres   = (cierresR.data   || []) as any[];
  const overrides = (overridesR.data || []) as any[];
  const reservas  = (reservasR.data  || []) as any[];
  const eventos   = (eventosR.data   || []) as any[];

  // ── Mapas auxiliares por fecha ─────────────────────────────────────────
  const cierreTotalPorFecha: Record<string, boolean> = {};
  const cierresParcialesPorFecha: Record<string, Set<string>> = {};
  for (const c of cierres) {
    if (c.tipo === "total") cierreTotalPorFecha[c.fecha] = true;
    else if (Array.isArray(c.salidas)) {
      if (!cierresParcialesPorFecha[c.fecha]) cierresParcialesPorFecha[c.fecha] = new Set();
      for (const sid of c.salidas) cierresParcialesPorFecha[c.fecha].add(sid);
    }
  }
  const overridePorFecha: Record<string, Record<string, any>> = {};
  for (const o of overrides) {
    if (!overridePorFecha[o.fecha]) overridePorFecha[o.fecha] = {};
    overridePorFecha[o.fecha][o.salida_id] = o;
  }

  // ── Pax que consume cupo de LANCHA, agregado por (fecha, salida_id) ───
  // Convención:
  //   - reservas con salida_id IS NULL   → "Sin Transporte" (cliente trae su lancha).
  //   - eventos sin salida_compartida_id → grupo con su propia logística.
  // Esas pax NO ocupan asiento en lancha de Atolón.
  const paxPorFechaSalida: Record<string, Record<string, number>> = {};
  function addPax(fecha: string, salidaId: string, pax: number) {
    if (!paxPorFechaSalida[fecha]) paxPorFechaSalida[fecha] = {};
    paxPorFechaSalida[fecha][salidaId] = (paxPorFechaSalida[fecha][salidaId] || 0) + pax;
  }
  // Track individuales con grupo_id para descontar del bulk del grupo
  const indivPorGrupoFecha: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of reservas) {
    if (!r.fecha || !r.salida_id) continue;
    addPax(r.fecha, r.salida_id, r.pax || 0);
    if (r.grupo_id) {
      if (!indivPorGrupoFecha[r.fecha]) indivPorGrupoFecha[r.fecha] = {};
      if (!indivPorGrupoFecha[r.fecha][r.grupo_id]) indivPorGrupoFecha[r.fecha][r.grupo_id] = {};
      indivPorGrupoFecha[r.fecha][r.grupo_id][r.salida_id] =
        (indivPorGrupoFecha[r.fecha][r.grupo_id][r.salida_id] || 0) + (r.pax || 0);
    }
  }
  for (const g of eventos) {
    if (!g.fecha) continue;
    const bulkTotal = ((g.pasadias_org || [])
      .filter((p: any) => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF")
      .reduce((s: number, p: any) => s + (Number(p.personas) || 0), 0)) || g.pax || 0;
    if (bulkTotal <= 0) continue;

    const targets = new Set<string>();
    if (g.salida_compartida_id) targets.add(g.salida_compartida_id);
    for (const sg of (g.salidas_grupo || [])) {
      if (sg?.id) targets.add(sg.id);
    }
    if (targets.size === 0) continue;

    const indivMap = indivPorGrupoFecha[g.fecha]?.[g.id] || {};

    if (targets.size === 1) {
      const sid = Array.from(targets)[0];
      const yaIndiv = indivMap[sid] || 0;
      addPax(g.fecha, sid, Math.max(0, bulkTotal - yaIndiv));
    } else {
      const pesos = (g.salidas_grupo || [])
        .map((sg: any) => ({ sid: sg?.id, peso: Number(sg?.personas) || 0 }))
        .filter((x: any) => x.sid && targets.has(x.sid));
      const totalPeso = pesos.reduce((s: number, x: any) => s + x.peso, 0);
      if (totalPeso > 0) {
        for (const { sid, peso } of pesos) {
          const aporteBruto = Math.round(bulkTotal * peso / totalPeso);
          const yaIndiv = indivMap[sid] || 0;
          addPax(g.fecha, sid, Math.max(0, aporteBruto - yaIndiv));
        }
      } else {
        const tgArr = Array.from(targets);
        const por = Math.floor(bulkTotal / tgArr.length);
        for (const sid of tgArr) {
          const yaIndiv = indivMap[sid] || 0;
          addPax(g.fecha, sid, Math.max(0, por - yaIndiv));
        }
      }
    }
  }

  // ── Por día: calcular salidas visibles con cupos por lancha ──────────
  // Aplica: cierres, overrides cerrar/abrir, extra_embarcaciones (capacidad ampliada),
  // y la cascada auto_apertura (S3 solo cuenta si S2 llegó a 75%).
  type SalidaDia = { salida_id: string; hora: string; capacidad: number; pax: number; cupos: number };
  function salidasDelDia(iso: string): SalidaDia[] {
    const cierresDia = cierresParcialesPorFecha[iso] || new Set<string>();
    const overrideDia = overridePorFecha[iso] || {};
    const paxDia = paxPorFechaSalida[iso] || {};

    // Paso 1: determinar visibilidad básica por salida (sin cascada).
    type Prep = { s: any; visible: boolean; capacidad: number; pax: number };
    const prep: Prep[] = salidas.map((s) => {
      const ovr = overrideDia[s.id];
      const extraCap = (ovr?.extra_embarcaciones || []).reduce(
        (sum: number, e: any) => sum + (Number(e.capacidad) || 0), 0,
      );
      const capacidad = (s.capacidad_total || 0) + extraCap;
      const pax = paxDia[s.id] || 0;
      let visible = true;
      if (ovr?.accion === "cerrar") visible = false;
      else if (ovr?.accion === "abrir") visible = true;
      else if (cierresDia.has(s.id)) visible = false;
      return { s, visible, capacidad, pax };
    });

    // Paso 2: aplicar cascada auto_apertura.
    // Una salida auto_apertura solo cuenta si la anterior (en orden) llegó a su umbral
    // de ocupación (default 75%). Esto refleja el modelo real: la 3a/4a salida solo
    // opera si las anteriores están saturadas.
    const result: SalidaDia[] = [];
    for (let i = 0; i < prep.length; i++) {
      const p = prep[i];
      if (!p.visible) continue;
      const ovr = overrideDia[p.s.id];
      // override "abrir" salta la cascada (decisión manual del admin)
      if (p.s.auto_apertura && ovr?.accion !== "abrir" && i > 0) {
        const prev = prep[i - 1];
        const prevCap = prev.capacidad || 1;
        const prevPct = (prev.pax || 0) / prevCap;
        const umbral = (prev.s.auto_umbral || 75) / 100;
        if (prevPct < umbral) continue;  // cascada no se activa todavía
      }
      result.push({
        salida_id: p.s.id,
        hora: p.s.hora,
        capacidad: p.capacidad,
        pax: p.pax,
        cupos: Math.max(0, p.capacidad - p.pax),
      });
    }
    return result;
  }

  // ── Construir respuesta por día ────────────────────────────────────────
  const dias: Record<string, {
    abierto: boolean;
    cupos_max_salida: number;
    cupos_total: number;
    salidas: SalidaDia[];
    cierre?: string;
  }> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (cierreTotalPorFecha[iso]) {
      dias[iso] = { abierto: false, cupos_max_salida: 0, cupos_total: 0, salidas: [], cierre: "total" };
      continue;
    }
    const salidasDia = salidasDelDia(iso);
    const cuposMax = salidasDia.reduce((m, x) => Math.max(m, x.cupos), 0);
    const cuposTotal = salidasDia.reduce((s, x) => s + x.cupos, 0);
    dias[iso] = {
      abierto: cuposMax > 0,
      cupos_max_salida: cuposMax,
      cupos_total: cuposTotal,
      salidas: salidasDia,
      ...(cierresParcialesPorFecha[iso] ? { cierre: "parcial" } : {}),
    };
  }

  return { year, month, dias };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/availability-engine/, "");

  if (req.method === "GET" && (path === "" || path === "/diag")) {
    return jsonResp({ ok: true, service: "availability-engine", version: "1.2" });
  }

  if (req.method === "POST" && path === "/check-month") {
    try {
      const body = (await req.json()) as MonthCheckInput;
      if (!body.year || !body.month || body.month < 1 || body.month > 12) {
        return jsonResp({ error: "year + month (1-12) requeridos" }, 400);
      }
      return jsonResp(await checkDisponibilidadMonth(body));
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  if (req.method === "POST" && path === "/check") {
    try {
      const body = (await req.json()) as CheckInput;
      if (!body.fecha || !Number.isInteger(body.num_personas) || body.num_personas <= 0) {
        return jsonResp({ error: "fecha y num_personas requeridos" }, 400);
      }
      return jsonResp(await checkDisponibilidad(body));
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  if (req.method === "POST" && path === "/check-detailed") {
    try {
      const body = (await req.json()) as DetailedCheckInput;
      if (!body.fecha) return jsonResp({ error: "fecha requerida" }, 400);
      return jsonResp(await checkDisponibilidadDetailed(body));
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  return jsonResp({ error: "endpoint not found", path }, 404);
});
