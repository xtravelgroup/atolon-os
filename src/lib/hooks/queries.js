// hooks/queries.js — Hooks de React Query para Atolón OS.
// ──────────────────────────────────────────────────────
// Adopción gradual: módulos viejos siguen usando .then/setState.
// Módulos nuevos / refactorizados deberían usar estos hooks.
//
// Beneficios al migrar un módulo:
// - El refetch al volver al módulo es automático y dedupea con otros
//   componentes que pidan la misma key.
// - staleTime 5min global → si dos componentes piden las mismas reservas
//   del día, una sola query.
// - invalidateQueries() después de un mutate refresca todas las vistas
//   afectadas en simultáneo.
//
// Ejemplo de migración (Reservas):
//   ANTES:
//     const [reservas, setReservas] = useState([]);
//     useEffect(() => {
//       supabase.from("reservas").select("*").eq("fecha", f).then(({data}) => setReservas(data || []));
//     }, [f]);
//
//   DESPUÉS:
//     const { data: reservas = [] } = useReservasDia(fecha);
//
// Después de un INSERT/UPDATE:
//   import { queryClient } from "../lib/queryClient";
//   queryClient.invalidateQueries({ queryKey: ["reservas"] });

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { qk } from "../queryClient";

// ── Reservas ────────────────────────────────────────────────────────

/** Reservas del día (no canceladas). */
export function useReservasDia(fecha, options = {}) {
  return useQuery({
    queryKey: qk.reservasDia(fecha),
    queryFn: async () => {
      const { data, error } = await supabase.from("reservas")
        .select("*").eq("fecha", fecha).neq("estado", "cancelado")
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!fecha,
    ...options,
  });
}

/** Reservas en un rango de fechas (para reportes). */
export function useReservasRango(desde, hasta, options = {}) {
  return useQuery({
    queryKey: qk.reservas({ desde, hasta }),
    queryFn: async () => {
      const { data, error } = await supabase.from("reservas")
        .select("*").gte("fecha", desde).lte("fecha", hasta)
        .neq("estado", "cancelado").order("fecha");
      if (error) throw error;
      return data || [];
    },
    enabled: !!(desde && hasta),
    ...options,
  });
}

// ── Eventos ─────────────────────────────────────────────────────────

/** Un evento por id. */
export function useEvento(id, options = {}) {
  return useQuery({
    queryKey: qk.evento(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("eventos")
        .select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    ...options,
  });
}

/** Eventos en un rango de fechas. */
export function useEventos({ desdeFecha, hastaFecha, stage } = {}, options = {}) {
  return useQuery({
    queryKey: qk.eventos({ desdeFecha, hastaFecha, stage }),
    queryFn: async () => {
      let q = supabase.from("eventos").select("*");
      if (desdeFecha) q = q.gte("fecha", desdeFecha);
      if (hastaFecha) q = q.lte("fecha", hastaFecha);
      if (stage)      q = q.eq("stage", stage);
      const { data, error } = await q.order("fecha");
      if (error) throw error;
      return data || [];
    },
    ...options,
  });
}

// ── Órdenes de compra ───────────────────────────────────────────────

/** Una OC con items. */
export function useOC(id, options = {}) {
  return useQuery({
    queryKey: qk.oc(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("ordenes_compra")
        .select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    ...options,
  });
}

/** Lista de OCs (default: últimos 90 días). */
export function useOCs({ estado, desde, proveedorId } = {}, options = {}) {
  return useQuery({
    queryKey: qk.ocs({ estado, desde, proveedorId }),
    queryFn: async () => {
      const desdeFecha = desde || (() => {
        const d = new Date(); d.setDate(d.getDate() - 90);
        return d.toISOString().slice(0, 10);
      })();
      let q = supabase.from("ordenes_compra")
        .select("*").gte("created_at", desdeFecha);
      if (estado)       q = q.eq("estado", estado);
      if (proveedorId)  q = q.eq("proveedor_id", proveedorId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    ...options,
  });
}

// ── Mutations helpers ───────────────────────────────────────────────

/** Hook genérico para invalidar varias keys tras un INSERT/UPDATE/DELETE.
 *  Ejemplo:
 *    const invalidate = useInvalidator();
 *    await supabase.from("reservas").insert({...});
 *    invalidate("reservas");
 */
export function useInvalidator() {
  const qc = useQueryClient();
  return (...keys) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}
