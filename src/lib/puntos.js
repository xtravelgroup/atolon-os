// ═══════════════════════════════════════════════
// SISTEMA DE PUNTOS B2B — lógica de asignación
// ═══════════════════════════════════════════════
import { supabase } from "./supabase";

// Cargar configuración de puntos
let _config = null;
export async function getPuntosConfig() {
  if (_config) return _config;
  if (!supabase) return null;
  const { data } = await supabase.from("b2b_puntos_config").select("*").eq("id", "default").single();
  _config = data;
  return data;
}

// Asignar puntos a un vendedor por una reserva confirmada
export async function asignarPuntosReserva({ vendedorId, agenteId, reservaId, pax, totalCOP, fecha, esGrupo }) {
  if (!supabase || !vendedorId) return 0;
  const cfg = await getPuntosConfig();
  if (!cfg || !cfg.activo) return 0;

  const transacciones = [];
  let totalPuntos = 0;

  // Base: puntos por reserva
  transacciones.push({ puntos: cfg.puntos_por_reserva, concepto: "Reserva confirmada", tipo: "credito" });
  totalPuntos += cfg.puntos_por_reserva;

  // Por cada pax
  const ptsPax = pax * cfg.puntos_por_pax;
  transacciones.push({ puntos: ptsPax, concepto: `${pax} pax × ${cfg.puntos_por_pax} pts`, tipo: "credito" });
  totalPuntos += ptsPax;

  // Por revenue (por millón)
  const millones = Math.floor(totalCOP / 1_000_000);
  if (millones > 0) {
    const ptsMillon = millones * cfg.puntos_por_millon;
    transacciones.push({ puntos: ptsMillon, concepto: `${millones}M vendidos × ${cfg.puntos_por_millon} pts`, tipo: "credito" });
    totalPuntos += ptsMillon;
  }

  // Bonus: grupo grande (10+ pax)
  if (pax >= 10 && cfg.bonus_grupo_10_pax > 0) {
    transacciones.push({ puntos: cfg.bonus_grupo_10_pax, concepto: `Bonus grupo grande (+10 pax)`, tipo: "bonus" });
    totalPuntos += cfg.bonus_grupo_10_pax;
  }

  // Bonus: fin de semana (sáb/dom)
  if (fecha) {
    const dia = new Date(fecha + "T12:00:00").getDay();
    if ((dia === 0 || dia === 6) && cfg.bonus_fin_semana > 0) {
      transacciones.push({ puntos: cfg.bonus_fin_semana, concepto: "Bonus fin de semana", tipo: "bonus" });
      totalPuntos += cfg.bonus_fin_semana;
    }
  }

  // Bonus: primera reserva del mes
  const mesActual = fecha ? fecha.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const { data: prevMes } = await supabase.from("b2b_puntos_historial")
    .select("id").eq("vendedor_id", vendedorId)
    .ilike("concepto", "Reserva confirmada")
    .gte("created_at", mesActual + "-01T00:00:00")
    .limit(1);
  if ((!prevMes || prevMes.length === 0) && cfg.bonus_primera_reserva_mes > 0) {
    transacciones.push({ puntos: cfg.bonus_primera_reserva_mes, concepto: "🌟 Bonus primera reserva del mes", tipo: "bonus" });
    totalPuntos += cfg.bonus_primera_reserva_mes;
  }

  // Insertar todas las transacciones
  const rows = transacciones.map(t => ({
    id: `PTS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    vendedor_id: vendedorId,
    aliado_id: agenteId,
    reserva_id: reservaId,
    puntos: t.puntos,
    concepto: t.concepto,
    tipo: t.tipo,
  }));

  await supabase.from("b2b_puntos_historial").insert(rows);
  _config = null; // reset cache
  return totalPuntos;
}

// Obtener saldo total de puntos de un vendedor
export async function getSaldoPuntos(vendedorId) {
  if (!supabase || !vendedorId) return 0;
  const { data } = await supabase.from("b2b_puntos_historial").select("puntos").eq("vendedor_id", vendedorId);
  return (data || []).reduce((s, r) => s + (r.puntos || 0), 0);
}

// Obtener ranking de vendedores de una agencia
export async function getRankingAgencia(aliadoId) {
  if (!supabase) return [];
  const { data: vendedores } = await supabase.from("b2b_usuarios").select("id, nombre, email, rol").eq("aliado_id", aliadoId).eq("activo", true);
  if (!vendedores?.length) return [];
  const { data: pts } = await supabase.from("b2b_puntos_historial").select("vendedor_id, puntos").eq("aliado_id", aliadoId);
  const map = {};
  (pts || []).forEach(p => { map[p.vendedor_id] = (map[p.vendedor_id] || 0) + p.puntos; });
  return vendedores.map(v => ({ ...v, puntos: map[v.id] || 0 })).sort((a, b) => b.puntos - a.puntos);
}
