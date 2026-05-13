// catalogoCache.js — Cache in-memory simple para tablas casi-estáticas.
// ─────────────────────────────────────────────────────────────────────
// Las tablas catálogo (salidas, embarcaciones, pasadias, usuarios, etc.)
// cambian poco a lo largo del día pero se piden a Supabase cada vez que
// el usuario abre un módulo. Eso suma 6-8 round-trips innecesarios por
// navegación. Este cache las guarda con TTL 5 min y dedupea queries en
// vuelo (si dos componentes piden lo mismo, una sola query).
//
// Uso:
//   import { getCatalogo, invalidarCatalogo } from "../lib/catalogoCache";
//   const salidas = await getCatalogo("salidas");
//   // tras escribir:
//   invalidarCatalogo("usuarios");
//
// Definir un catálogo nuevo: agregalo al map CATALOGOS abajo.

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

const TTL_MS = 5 * 60 * 1000; // 5 minutos

// Definición de cada catálogo: tabla + select + filtros base + orden.
// La key es el nombre lógico que pasa el caller a getCatalogo().
const CATALOGOS = {
  salidas: {
    table: "salidas",
    select: "*",
    filter: q => q.eq("activo", true),
    order: { col: "orden", asc: true },
  },
  pasadias: {
    table: "pasadias",
    select: "*",
    order: { col: "orden", asc: true },
  },
  embarcaciones: {
    table: "embarcaciones",
    select: "*",
    order: { col: "nombre", asc: true },
  },
  embarcaciones_activas: {
    table: "embarcaciones",
    select: "*",
    filter: q => q.eq("estado", "activo"),
    order: { col: "nombre", asc: true },
  },
  aliados_b2b: {
    table: "aliados_b2b",
    // Columnas reales (verificadas): id, tipo, nombre, contacto, tel, email,
    // comision, estado. Pedir una col inexistente hace fallar la query
    // entera; como Eventos hace Promise.all con esto, rompía todo el módulo
    // (todos los KPIs en $0 porque eventos jamás se setean).
    select: "id, nombre, tipo, comision, estado",
    order: { col: "nombre", asc: true },
  },
  usuarios: {
    table: "usuarios",
    select: "id, nombre, email, rol_id, activo, modulos",
    filter: q => q.eq("activo", true),
    order: { col: "nombre", asc: true },
  },
  vendedores: {
    table: "usuarios",
    select: "id, nombre, email",
    filter: q => q.in("rol_id", ["ventas", "gerente_ventas"]).eq("activo", true),
    order: { col: "nombre", asc: true },
  },
  lanchas: {
    table: "lanchas",
    select: "*",
    filter: q => q.eq("activo", true),
    order: { col: "nombre", asc: true },
  },
  b2b_convenios: {
    table: "b2b_convenios",
    select: "*",
    filter: q => q.eq("activo", true),
  },
  proveedores: {
    table: "proveedores",
    select: "id, nombre, nit, email, telefono, loggro_id, activo",
    filter: q => q.eq("activo", true),
    order: { col: "nombre", asc: true },
  },
  items_catalogo: {
    table: "items_catalogo",
    // Antes era select: "*" — fetcheaba todas las columnas incluyendo
    // jsonb pesados (1.95MB en total). Solo necesitamos lo que consumen
    // los componentes (picker de productos, búsqueda, recepción).
    select: "id, nombre, unidad, categoria, precio_compra, codigo_barras, loggro_id, unidades_por_paquete, unidad_compra, unidad_individual, foto_url, stock_actual",
    filter: q => q.eq("activo", true),
    order: { col: "nombre", asc: true },
  },
};

// Estado: { key → { data, expiresAt } }
const cache = new Map();
// In-flight: { key → Promise } para dedupear queries paralelas
const inflight = new Map();

async function fetchCatalogo(key) {
  const def = CATALOGOS[key];
  if (!def) throw new Error(`Catálogo desconocido: "${key}"`);
  let q = supabase.from(def.table).select(def.select || "*");
  if (def.filter) q = def.filter(q);
  if (def.order) q = q.order(def.order.col, { ascending: def.order.asc !== false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Obtiene el catálogo (de cache si está fresco, sino lo refresca).
 * @param {string} key  nombre del catálogo (ver CATALOGOS arriba)
 * @param {object} [opts]
 * @param {boolean} [opts.force]  fuerza refetch ignorando cache
 * @returns {Promise<Array>}
 */
export async function getCatalogo(key, opts = {}) {
  const { force = false } = opts;
  const now = Date.now();

  if (!force) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.data;
  }
  // Dedupe: si ya hay una query en vuelo para este key, esperarla.
  const flying = inflight.get(key);
  if (flying && !force) return flying;

  const promise = fetchCatalogo(key)
    .then(data => {
      cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
      inflight.delete(key);
      return data;
    })
    .catch(err => {
      inflight.delete(key);
      // Lección aprendida: si un catálogo está mal definido (col inexistente,
      // RLS bloqueando, etc) y throw, el Promise.all del módulo consumidor se
      // rompe entero y se ven 0s en todos los KPIs. Mejor degradar a array
      // vacío + console.error: los componentes verán "sin datos" pero NO se
      // cae el módulo completo. Si hay valor stale lo devolvemos.
      console.error(`[catalogoCache] "${key}" fallo:`, err);
      const stale = cache.get(key);
      if (stale) return stale.data;
      return [];
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Invalidar uno o varios catálogos (después de un INSERT/UPDATE/DELETE).
 * Sin args invalida todo.
 */
export function invalidarCatalogo(...keys) {
  if (keys.length === 0) {
    cache.clear();
    return;
  }
  for (const k of keys) cache.delete(k);
}

/**
 * Hook React: devuelve { data, loading, error, refetch }.
 * No depende de React Query — wrapper minimal sobre getCatalogo + useState.
 */
export function useCatalogo(key) {
  const [data, setData] = useState(() => {
    const hit = cache.get(key);
    return hit && hit.expiresAt > Date.now() ? hit.data : null;
  });
  const [loading, setLoading] = useState(data == null);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const d = await getCatalogo(key, { force });
      if (mounted.current) { setData(d); setLoading(false); }
    } catch (e) {
      if (mounted.current) { setError(e); setLoading(false); }
    }
  }, [key]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refetch = useCallback(() => load(true), [load]);
  return { data, loading, error, refetch };
}

// Prefetch: llamar al iniciar la app para tener catálogos calientes ya.
export function prefetchCatalogos(keys = ["salidas", "pasadias", "embarcaciones_activas", "usuarios", "lanchas", "aliados_b2b"]) {
  return Promise.all(keys.map(k => getCatalogo(k).catch(() => null)));
}
