import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import App from "./App.jsx";
import { B } from "./brand";

// ── Recovery automático tras deploy con chunks viejos ─────────────────
// Cuando Vercel despliega una nueva versión, los nombres de los chunks
// cambian (Eventos-XXXXXX.js). Si el usuario tiene la página abierta
// y trata de cargar un módulo lazy, el chunk viejo ya no existe →
// "Failed to fetch dynamically imported module".
// Solución: detectar ese error y forzar reload (1 vez por sesión).
const RELOAD_FLAG = "__atolon_chunk_reload";
function isChunkLoadError(err) {
  const msg = String(err?.message || err || "");
  return /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(msg);
}
function recoverFromChunkError(err) {
  console.warn("[chunk-recover] detected stale chunk error:", err?.message || err);
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    // Ya se intentó recargar — no entrar en loop. Mostrar mensaje al usuario.
    console.error("[chunk-recover] reload already attempted, abandonning");
    return;
  }
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
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
// Si el reload anterior fue hace más de 30s, limpiar el flag (página cargó
// bien) — así futuros chunks errors pueden volver a recargar.
if (sessionStorage.getItem(RELOAD_FLAG)) {
  setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 30000);
}

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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Suspense fallback={<GlobalSuspenseFallback />}>
      <App />
    </Suspense>
  </StrictMode>
);
