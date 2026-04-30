import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import App from "./App.jsx";
import { B } from "./brand";

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
