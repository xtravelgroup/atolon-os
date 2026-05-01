// queryClient.js — Cliente React Query global de la app.
// ──────────────────────────────────────────────────────
// Defaults afinados a las características de Atolón OS:
// - staleTime 5 min: las queries de catálogos / dashboard se refetchean
//   con poca frecuencia. Cinco minutos es suficiente.
// - retry 1: reintentos agresivos no ayudan en una app interna; mejor
//   fallar rápido para que el usuario vea el error.
// - refetchOnWindowFocus false: no queremos disparar 20 queries cada vez
//   que el usuario alterna pestañas.
// - refetchOnReconnect: mantenido en true (default) por si pierden wifi
//   en el muelle y vuelven.
//
// Patrón de uso recomendado:
//   const { data, isLoading } = useQuery({
//     queryKey: ["reservas", { fecha: "2026-04-30" }],
//     queryFn: async () => (await supabase.from("reservas")
//       .select("*").eq("fecha", "2026-04-30")).data || [],
//   });
//
// Después de un mutate, invalidar:
//   queryClient.invalidateQueries({ queryKey: ["reservas"] });

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 min
      gcTime:    30 * 60 * 1000,       // 30 min en memoria antes de recolectar
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Helpers de "query key" — convención centralizada para evitar typos.
// Cada módulo que use React Query debería usar estos builders en lugar
// de hardcodear strings.
export const qk = {
  reservas:    (params = {}) => ["reservas", params],
  reservasDia: (fecha)        => ["reservas", { fecha }],
  evento:      (id)           => ["evento", id],
  eventos:     (params = {}) => ["eventos", params],
  ocs:         (params = {}) => ["ordenes_compra", params],
  oc:          (id)           => ["orden_compra", id],
  // Catálogos casi-estáticos siguen usando catalogoCache (in-memory),
  // pero si en el futuro queremos migrarlos a RQ:
  catalogo:    (key)          => ["catalogo", key],
};
