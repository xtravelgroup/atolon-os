// CajasSetup — Página de instalación de impresoras del evento.
//
// URL pública: https://www.atolon.co/cajas-setup
//
// Flujo del usuario:
//   1. Abre la página en cualquier computador del evento
//   2. Detecta Mac/Windows automáticamente
//   3. Lista todas las impresoras (IMP-1..IMP-10) con estado
//   4. Tap "Setup en este computador" en la impresora que corresponde
//   5. Baja un script .bat (Windows) o .command (Mac) ya custom:
//        - Descarga el .exe del print-agent
//        - Crea imp.txt con el IMP-N
//        - Lanza el agent (corre en background)
//        - Crea shortcut en Desktop para re-launch
//   6. Doble click al script → todo se instala solo
//
// El .exe tiene SUPABASE_URL + ANON_KEY bakeados al build.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#0D1B3E",
  bgSoft: "#1A2D5C",
  text: "#fff",
  textMid: "rgba(255,255,255,0.65)",
  textLow: "rgba(255,255,255,0.35)",
  sand: "#C8B99A",
  cream: "#F4EBD8",
  green: "#4CAF7D",
  red: "#D64545",
  amber: "#E8A020",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.18)",
};

const EXE_URL = "https://www.atolon.co/cajas/atolon-print-agent.exe";

function detectOS() {
  const p = (navigator.platform || "").toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("mac")) return "mac";
  if (p.includes("linux")) return "linux";
  return "unknown";
}

export default function CajasSetup() {
  const [os, setOs] = useState(detectOS());
  const [impresoras, setImpresoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ultimoImp, setUltimoImp] = useState(null); // IMP-N que se descargó al final

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    supabase
      .from("cajas_evento_impresoras")
      .select("id, numero, nombre, ubicacion, printer_ip, printer_port, tipo_conexion, activa")
      .eq("activa", true)
      .order("numero")
      .then(({ data }) => {
        setImpresoras(data || []);
        setLoading(false);
      });
  }, []);

  const descargarBatWin = (imp) => {
    const bat = `@echo off
title Atolon Print Agent - ${imp.id}
echo === Atolon: Instalando agent para ${imp.nombre} ===
echo.

set "FOLDER=C:\\Atolon-Print-${imp.id}"
mkdir "%FOLDER%" 2>nul
cd /d "%FOLDER%"

echo Descargando print-agent.exe (~46MB)...
echo (esto puede tardar 30-60 segundos)
curl.exe -L -o atolon-print-agent.exe "${EXE_URL}"
if errorlevel 1 (
  echo ERROR descargando. Verifica internet y reintenta.
  pause
  exit /b 1
)

echo Configurando para ${imp.id}...
echo ${imp.id}> imp.txt

echo Cerrando cualquier agent que estuviera corriendo...
taskkill /F /IM atolon-print-agent.exe /T 2>nul

echo Lanzando agent en background...
start "Atolon ${imp.id}" /min "%FOLDER%\\atolon-print-agent.exe"

echo Creando shortcut en Desktop...
powershell -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\Atolon Print - ${imp.id}.lnk');$s.TargetPath='%FOLDER%\\atolon-print-agent.exe';$s.WorkingDirectory='%FOLDER%';$s.IconLocation='%FOLDER%\\atolon-print-agent.exe';$s.Save()" 2>nul

echo.
echo ============================================================
echo  LISTO. Print agent para ${imp.id} corriendo en background.
echo  Verificalo desde el celular: /cajas con impresora ${imp.id}
echo ============================================================
echo.
echo Esta ventana se cierra en 6 segundos.
timeout /t 6 /nobreak >nul
`;
    const blob = new Blob([bat], { type: "application/x-bat" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `atolon-setup-${imp.id.toLowerCase()}.bat`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setUltimoImp(imp.id);
  };

  // Mac: el .exe no sirve. Le damos npm/Node directo desde source — pero
  // por ahora le ofrecemos el camino del bridge browser con --kiosk-printing.
  const descargarCommandMac = (imp) => {
    const sh = `#!/bin/bash
set -e
echo "=== Atolon: setup ${imp.nombre} (modo browser/kiosk) ==="
echo "Mac no tiene .exe — usamos Chrome --kiosk-printing"
echo ""

# Configurar papel custom 72x72mm
if command -v lpoptions >/dev/null 2>&1; then
  lpoptions -p Gainscha_GA_E200I -o media=Custom.72x72mm 2>/dev/null || true
fi

# Matar Chrome y relanzar con --kiosk-printing apuntando al bridge
pkill -f "Google Chrome" 2>/dev/null || true
killall "Google Chrome" 2>/dev/null || true
sleep 3

mkdir -p "/tmp/atolon-kiosk-${imp.id.toLowerCase()}"
open -na "Google Chrome" --args \\
  --user-data-dir="/tmp/atolon-kiosk-${imp.id.toLowerCase()}" \\
  --kiosk-printing \\
  --new-window \\
  "https://www.atolon.co/cajas-imprimir?id=${imp.id}"

echo "Listo. Chrome corriendo silencioso para ${imp.id}"
sleep 2
`;
    const blob = new Blob([sh], { type: "application/x-sh" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `atolon-setup-${imp.id.toLowerCase()}.command`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setUltimoImp(imp.id);
  };

  const descargar = (imp) => os === "windows" ? descargarBatWin(imp) : descargarCommandMac(imp);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 12, color: C.textMid, letterSpacing: "0.25em", fontWeight: 700 }}>
            ATOLÓN · SETUP DE IMPRESORAS
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, marginTop: 8, letterSpacing: "-0.02em" }}>
            🖨 Instalar impresora del evento
          </div>
          <div style={{ fontSize: 14, color: C.textMid, marginTop: 12, maxWidth: 600, margin: "12px auto 0" }}>
            Abrí esta página en el computador donde está conectada (o cerca de) la impresora.
            Escogé cuál es, descargás un atajo, doble click y queda lista.
          </div>
        </div>

        {/* OS detector */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: "16px 22px", marginBottom: 30,
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 12, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700 }}>
            SISTEMA DETECTADO:
          </div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {os === "windows" && "🪟 Windows"}
            {os === "mac"     && "🍎 macOS"}
            {os === "linux"   && "🐧 Linux"}
            {os === "unknown" && "❓ Desconocido"}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {["windows", "mac"].map(o => (
              <button key={o} onClick={() => setOs(o)}
                style={{
                  padding: "8px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                  background: os === o ? C.sand : "transparent",
                  color: os === o ? C.bg : C.textMid,
                  border: `1.5px solid ${os === o ? C.sand : C.border}`,
                  borderRadius: 8, cursor: "pointer",
                }}>
                {o === "windows" ? "🪟 Windows" : "🍎 Mac"}
              </button>
            ))}
          </div>
        </div>

        {/* Confirmación de última descarga */}
        {ultimoImp && (
          <div style={{
            background: C.green + "22", border: `2px solid ${C.green}`, borderRadius: 12,
            padding: 18, marginBottom: 22, textAlign: "center",
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.green, marginBottom: 8 }}>
              ✅ Atajo bajado para {ultimoImp}
            </div>
            <div style={{ fontSize: 13, color: C.text }}>
              {os === "windows" ? (
                <>
                  Abrí <strong>Descargas</strong> → <strong>doble click</strong> al archivo
                  <code style={{ background: C.bgSoft, padding: "2px 8px", borderRadius: 4, marginLeft: 6 }}>
                    atolon-setup-{ultimoImp.toLowerCase()}.bat
                  </code>.
                  Si Windows pregunta SmartScreen → <strong>"Más información" → "Ejecutar de todos modos"</strong>.
                </>
              ) : (
                <>
                  Abrí Terminal y corré:<br/>
                  <code style={{ background: C.bgSoft, padding: "4px 8px", borderRadius: 4, display: "inline-block", marginTop: 6, fontSize: 11 }}>
                    chmod +x ~/Downloads/atolon-setup-{ultimoImp.toLowerCase()}.command && ~/Downloads/atolon-setup-{ultimoImp.toLowerCase()}.command
                  </code>
                </>
              )}
            </div>
          </div>
        )}

        {/* Pasos */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: C.textMid, letterSpacing: "0.16em", fontWeight: 800, marginBottom: 12 }}>
            ESCOGÉ CUÁL IMPRESORA ES ESTA
          </div>
          {loading && <div style={{ color: C.textMid, padding: 20 }}>Cargando impresoras…</div>}
        </div>

        {/* Lista de impresoras */}
        <div style={{ display: "grid", gap: 12 }}>
          {impresoras.map(imp => (
            <div key={imp.id} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: 18,
              display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "center",
            }}>
              <div style={{
                background: C.sand, color: C.bg,
                width: 60, height: 60, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, fontWeight: 900,
              }}>#{imp.numero}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>
                  {imp.nombre}
                </div>
                {imp.ubicacion && (
                  <div style={{ fontSize: 13, color: C.textMid, marginTop: 3 }}>
                    📍 {imp.ubicacion}
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.textLow, marginTop: 6, fontFamily: "monospace", letterSpacing: "0.04em" }}>
                  {imp.id} ·
                  {imp.tipo_conexion === "network"
                    ? ` Red ${imp.printer_ip || ""}:${imp.printer_port || 9100}`
                    : " USB"}
                </div>
              </div>
              <button onClick={() => descargar(imp)}
                style={{
                  background: C.green, color: "#fff", border: "none",
                  padding: "14px 24px", borderRadius: 10, cursor: "pointer",
                  fontSize: 13, fontWeight: 900, letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}>
                ⬇ SETUP EN ESTE COMPUTADOR
              </button>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div style={{
          marginTop: 36, padding: "20px 24px",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          fontSize: 13, lineHeight: 1.6, color: C.textMid,
        }}>
          <div style={{ fontSize: 12, color: C.sand, letterSpacing: "0.15em", fontWeight: 800, marginBottom: 10 }}>
            ¿CÓMO FUNCIONA?
          </div>
          {os === "windows" ? (
            <ul style={{ paddingLeft: 22, margin: 0 }}>
              <li><strong>1.</strong> El .bat descarga el agente (~46MB) y lo guarda en <code>C:\Atolon-Print-IMP-X\</code></li>
              <li><strong>2.</strong> Crea un archivo <code>imp.txt</code> con el ID de la impresora</li>
              <li><strong>3.</strong> Lanza el agente en background — escucha la cola de ventas</li>
              <li><strong>4.</strong> Crea shortcut en Desktop para re-lanzar si reinicias</li>
              <li><strong>5.</strong> Los cajeros desde el celular escogen esta impresora y los tickets salen sin diálogo</li>
            </ul>
          ) : (
            <ul style={{ paddingLeft: 22, margin: 0 }}>
              <li><strong>1.</strong> El .command mata Chrome y lo relanza con <code>--kiosk-printing</code></li>
              <li><strong>2.</strong> Chrome se abre en el dashboard de la impresora</li>
              <li><strong>3.</strong> Recibe la cola en Realtime e imprime cada ticket sin diálogo</li>
              <li><strong>4.</strong> Dejá esa pestaña abierta todo el evento</li>
            </ul>
          )}
        </div>

        <div style={{ marginTop: 22, textAlign: "center", fontSize: 11, color: C.textLow, letterSpacing: "0.06em" }}>
          ATOLÓN BEACH CLUB · Para soporte avisá a Eric
        </div>
      </div>
    </div>
  );
}
