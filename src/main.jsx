import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./global.css";
import App from "./App.jsx";
import { B } from "./brand";
import { queryClient } from "./lib/queryClient";

// ── Recovery automático tras deploy con chunks viejos ─────────────────
// Cuando Vercel despliega una nueva versión, los nombres de los chunks
// cambian (Eventos-XXXXXX.js). Si el usuario tiene la página abierta
// y trata de cargar un módulo lazy, el chunk viejo ya no existe →
// "Failed to fetch dynamically imported module".
//
// Debounce por timestamp: solo bloquea reloads dentro de los últimos 10s
// (anti-loop). Si pasaron >10s desde el último reload, permite otro —
// esto cubre el caso de varios deploys seguidos en una sesión larga.
const RELOAD_TS_KEY = "__atolon_chunk_reload";
const RELOAD_DEBOUNCE_MS = 10_000;
function isChunkLoadError(err) {
  const msg = String(err?.message || err || "");
  return /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(msg);
}
function recoverFromChunkError(err) {
  console.warn("[chunk-recover] detected stale chunk error:", err?.message || err);
  const last = Number(sessionStorage.getItem(RELOAD_TS_KEY)) || 0;
  if (Date.now() - last < RELOAD_DEBOUNCE_MS) {
    console.error("[chunk-recover] reload too recent, skipping to avoid loop");
    return;
  }
  sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  // Limpiar caches del navegador para evitar recibir el HTML cacheado viejo.
  if (typeof caches !== "undefined") {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
}
window.addEventListener("error", (e) => {
  if (isChunkLoadError(e?.error || e?.message)) {
    e.preventDefault();
    recoverFromChunkError(e.error || e);
  }
});
window.addEventListener("unhandledrejection", (e) => {
  if (isChunkLoadError(e?.reason)) {
    e.preventDefault();
    recoverFromChunkError(e.reason);
  }
});

// Loading fallback mostrado mientras un chunk lazy se descarga.
// Match con el estilo del LoadingScreen interno de App.jsx para
// transición suave durante navegación.
function GlobalSuspenseFallback() {
  return (
    <div style={{
      minHeight: "100vh",
      background: B?.navy || "#0D1B3E",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#C8B99A",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, margin: "0 auto 14px",
          border: "3px solid rgba(200,185,154,0.2)",
          borderTopColor: "#C8B99A",
          borderRadius: "50%",
          animation: "atolon-spin 0.8s linear infinite",
        }} />
        <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Atolón OS
        </div>
      </div>
      <style>{`@keyframes atolon-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Pre-cargar catálogos casi-estáticos en background mientras App se monta.
// Cuando el usuario abra el primer módulo ya están en cache → cambio de
// módulo más fluido (ahorra ~6 round-trips por navegación).
//
// IMPORTANTE: solo prefetcheamos en rutas DE STAFF. En rutas públicas
// (booking, pago, agencia, carreras, etc.) los visitantes NO necesitan
// los catálogos internos y traerlos sin razón ralentiza el TTFB del
// landing.
const isPublicRoute = (() => {
  const path = window.location.pathname || "/";
  const route = path.replace(/^\/+/, "").split("/")[0];
  // Mismas rutas que App.jsx considera "públicas"
  return ["", "booking", "pago", "agencia", "empleados", "carreras", "blueapple",
          "las-americas", "gran-fondo", "nairo", "reset-password", "zarpe-info",
          "zarpe-grupo", "despedidas", "contratistas", "escanear", "escanear-productos",
          "verificar", "dia-de-la-madre", "madres", "m", "room", "track"
         ].includes(route);
})();

if (!isPublicRoute) {
  // Damos un pequeño delay para no competir con el initial render.
  setTimeout(() => {
    import("./lib/catalogoCache.js")
      .then(m => m.prefetchCatalogos())
      .catch(() => {});
  }, 500);
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<GlobalSuspenseFallback />}>
        <App />
      </Suspense>
    </QueryClientProvider>
  </StrictMode>
);
