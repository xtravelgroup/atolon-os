// CajasImpresion — página puente que corre en CADA computador del evento
// conectado a una impresora DIG-E200I.
//
// Setup en el computador:
//   1. Configurar la DIG-E200I como impresora del sistema con papel 72×72mm.
//   2. Abrir Chrome con flag --kiosk-printing (auto-confirma diálogos):
//      chrome --kiosk-printing https://www.atolon.co/cajas-imprimir?id=IMP-3
//   3. Dejar la pestaña abierta — escucha la cola en Realtime y va
//      imprimiendo los tickets que los cajeros envían desde sus celulares.
//
// La pestaña muestra un dashboard grande con el nombre de la impresora,
// los tickets pendientes/impresos y el último ticket recibido. Útil
// para confirmar que el computador está vivo durante el evento.

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#0D1B3E", text: "#fff", textMid: "rgba(255,255,255,0.65)",
  textLow: "rgba(255,255,255,0.35)",
  sand: "#C8B99A", cream: "#F4EBD8",
  green: "#4CAF7D", red: "#D64545", amber: "#E8A020",
  card: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.16)",
};

export default function CajasImpresion() {
  const impresoraId = (() => {
    const u = new URLSearchParams(window.location.search);
    return (u.get("id") || "").toUpperCase();
  })();

  const [impresora, setImpresora] = useState(null);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ recibidos: 0, impresos: 0, errores: 0 });
  const [ultimo, setUltimo] = useState(null);
  const [enCola, setEnCola] = useState(0);
  const [conexion, setConexion] = useState("conectando"); // "conectando" | "live" | "polling" | "error"
  const [ultimoCheck, setUltimoCheck] = useState(null);
  const [modalSilent, setModalSilent] = useState(false);
  const procesadosRef = useRef(new Set()); // evita doble-print si llega 2x

  // procesarPendientes — busca pending+failed para esta impresora y los imprime.
  // Reutilizable: corre al montar, en cada poll de seguridad, al volver el
  // foco a la pestaña, y al reconectar después de perder internet.
  async function procesarPendientes() {
    if (!supabase || !impresoraId) return;
    const { data, error: err } = await supabase
      .from("cajas_evento_impresion_queue")
      .select("*")
      .eq("impresora_id", impresoraId)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(20);
    if (err) {
      console.warn("[imp/poll]", err.message);
      setConexion("error");
      return;
    }
    setUltimoCheck(new Date());
    (data || []).forEach(job => imprimirJob(job));
  }

  useEffect(() => {
    if (!impresoraId) { setError("Falta el parámetro ?id=IMP-N en la URL"); return; }
    if (!supabase) { setError("Supabase no disponible"); return; }

    let alive = true;
    let canal;
    let pollTimer;
    let visibilityHandler;
    let onlineHandler;

    (async () => {
      const { data, error: err } = await supabase
        .from("cajas_evento_impresoras")
        .select("id, numero, nombre, ubicacion, activa")
        .eq("id", impresoraId)
        .maybeSingle();
      if (!alive) return;
      if (err)   { setError(err.message); return; }
      if (!data) { setError(`Impresora ${impresoraId} no existe. Pídele al admin que la cree.`); return; }
      setImpresora(data);

      // 1) Procesar pendientes que estaban antes de que abrieras la pestaña
      await procesarPendientes();

      // 2) Suscribirse a INSERTs nuevos vía Realtime
      canal = supabase.channel(`imp-${impresoraId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "cajas_evento_impresion_queue",
          filter: `impresora_id=eq.${impresoraId}`,
        }, payload => imprimirJob(payload.new))
        .subscribe((status) => {
          if (status === "SUBSCRIBED")          setConexion("live");
          else if (status === "CHANNEL_ERROR")  setConexion("polling");
          else if (status === "TIMED_OUT")      setConexion("polling");
          else if (status === "CLOSED")         setConexion("polling");
        });

      // 3) Polling de respaldo cada 30s — si Realtime se cae sin avisar,
      //    igual pescamos los pendientes. Cinturón + tirantes.
      pollTimer = setInterval(() => { if (alive) procesarPendientes(); }, 30000);

      // 4) Al volver foco a la pestaña, forzar un check inmediato.
      //    Útil cuando el laptop sale del sleep.
      visibilityHandler = () => {
        if (!document.hidden && alive) procesarPendientes();
      };
      document.addEventListener("visibilitychange", visibilityHandler);

      // 5) Al reconectar internet, también procesar pendientes.
      onlineHandler = () => { if (alive) procesarPendientes(); };
      window.addEventListener("online", onlineHandler);
    })();

    return () => {
      alive = false;
      if (canal) supabase.removeChannel(canal);
      if (pollTimer) clearInterval(pollTimer);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      if (onlineHandler) window.removeEventListener("online", onlineHandler);
    };
  }, [impresoraId]);

  async function imprimirJob(job) {
    if (!job || !job.id) return;
    if (procesadosRef.current.has(job.id)) return;
    procesadosRef.current.add(job.id);

    setEnCola(c => c + 1);
    setStats(s => ({ ...s, recibidos: s.recibidos + 1 }));

    // Marcar printing
    supabase.from("cajas_evento_impresion_queue").update({
      status: "printing", intentos: (job.intentos || 0) + 1,
    }).eq("id", job.id).then(() => {});

    // Iframe oculto + window.print()
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:-9999px;bottom:-9999px;width:80mm;height:80mm;border:0;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(iframe);

    const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };

    const marcarOk = () => {
      supabase.from("cajas_evento_impresion_queue").update({
        status: "printed", printed_at: new Date().toISOString(), error: null,
      }).eq("id", job.id).then(() => {});
      setStats(s => ({ ...s, impresos: s.impresos + 1 }));
      setUltimo({
        cuando: new Date(),
        venta: job.venta_id, cajero: job.cajero_nombre,
        nItems: (job.items || []).length,
      });
      setEnCola(c => Math.max(0, c - 1));
    };
    const marcarErr = (e) => {
      supabase.from("cajas_evento_impresion_queue").update({
        status: "failed", error: String(e?.message || e || "unknown"),
      }).eq("id", job.id).then(() => {});
      setStats(s => ({ ...s, errores: s.errores + 1 }));
      setEnCola(c => Math.max(0, c - 1));
    };

    iframe.onload = () => {
      try {
        const w = iframe.contentWindow;
        w.focus();
        setTimeout(() => {
          try {
            w.print();
            marcarOk();
          } catch (e) {
            console.error("[imp/print/win]", e);
            marcarErr(e);
          }
          setTimeout(cleanup, 8000);
        }, 250);
      } catch (e) {
        console.error("[imp/print/load]", e);
        marcarErr(e);
        cleanup();
      }
    };
    iframe.srcdoc = job.ticket_html;
  }

  if (error) return (
    <FullScreenMsg color={C.red} icon="⚠️" title="Error" subtitle={error} />
  );
  if (!impresora) return (
    <FullScreenMsg color={C.amber} icon="⏳" title={`Cargando ${impresoraId || "impresora"}...`} subtitle="" />
  );

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>

      {/* Header */}
      <div style={{ padding: "30px 40px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: C.textMid, letterSpacing: "0.2em", fontWeight: 700 }}>
              ATOLÓN · IMPRESORA REMOTA
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 8 }}>
              {impresora.nombre}
            </div>
            {impresora.ubicacion && (
              <div style={{ fontSize: 18, color: C.sand, marginTop: 8, fontWeight: 600 }}>
                📍 {impresora.ubicacion}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            {(() => {
              const conf = conexion === "live"     ? { color: C.green,  label: "LIVE",     pulse: true  }
                         : conexion === "polling"  ? { color: C.amber,  label: "POLLING",  pulse: true  }
                         : conexion === "error"    ? { color: C.red,    label: "ERROR",    pulse: false }
                         :                            { color: C.amber, label: "CONECTANDO…", pulse: true };
              return (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "10px 18px", background: conf.color + "33",
                  border: `2px solid ${conf.color}`, borderRadius: 30,
                  fontSize: 14, fontWeight: 800, letterSpacing: "0.1em",
                }}>
                  <span style={{
                    display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                    background: conf.color,
                    animation: conf.pulse ? "pulse 1.4s ease-in-out infinite" : "none",
                  }} />
                  {conf.label}
                </div>
              );
            })()}
            <div style={{ fontSize: 11, color: C.textLow, marginTop: 10, fontFamily: "monospace" }}>
              {impresora.id}
              {ultimoCheck && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  · check {ultimoCheck.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </div>
            <button onClick={() => setModalSilent(true)} style={{
              marginTop: 12, padding: "8px 16px",
              background: C.sand, color: C.navy,
              border: "none", borderRadius: 8,
              fontSize: 12, fontWeight: 800, letterSpacing: "0.08em",
              cursor: "pointer",
            }}>🔇 HACER SILENCIOSO</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0, borderBottom: `1px solid ${C.border}`,
      }}>
        <Stat label="Recibidos" valor={stats.recibidos} color={C.sand} />
        <Stat label="Impresos"  valor={stats.impresos}  color={C.green} />
        <Stat label="En cola"   valor={enCola}          color={C.amber} pulsar={enCola > 0} />
        <Stat label="Errores"   valor={stats.errores}   color={C.red} sinBorde />
      </div>

      {/* Último ticket impreso */}
      <div style={{ flex: 1, padding: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {ultimo ? (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "30px 40px", textAlign: "center", maxWidth: 600, width: "100%",
          }}>
            <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.2em", fontWeight: 700, marginBottom: 10 }}>
              ÚLTIMO TICKET IMPRESO
            </div>
            <div style={{ fontSize: 44, fontWeight: 900, marginBottom: 6 }}>
              ✅ {ultimo.nItems} ticket{ultimo.nItems === 1 ? "" : "s"}
            </div>
            <div style={{ fontSize: 15, color: C.textMid, marginBottom: 4 }}>
              {ultimo.cajero || "—"} · {ultimo.cuando.toLocaleTimeString("es-CO")}
            </div>
            <div style={{ fontSize: 11, color: C.textLow, fontFamily: "monospace" }}>
              {ultimo.venta}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", color: C.textLow }}>
            <div style={{ fontSize: 80, marginBottom: 20 }}>🖨️</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              Esperando tickets…
            </div>
            <div style={{ fontSize: 14, color: C.textLow, marginTop: 10, maxWidth: 420 }}>
              Los cajeros que escojan <strong style={{ color: C.sand }}>{impresora.nombre}</strong> en su celular enviarán sus tickets aquí.
            </div>
          </div>
        )}
      </div>

      {/* Footer con instrucciones */}
      <div style={{
        padding: "16px 40px", borderTop: `1px solid ${C.border}`,
        fontSize: 11, color: C.textLow, letterSpacing: "0.06em",
        display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <span>⚠ Dejá esta pestaña abierta. Mantené el laptop conectado a corriente y desactivá el sleep. Chrome --kiosk-printing imprime sin diálogo.</span>
        <span>Papel: 72×72mm · DIG-E200I</span>
      </div>

      {modalSilent && <ModalSilencioso impresoraId={impresoraId} onClose={() => setModalSilent(false)} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MODAL: comando para hacer Chrome silencioso (--kiosk-printing)
// ──────────────────────────────────────────────────────────────────────
function ModalSilencioso({ impresoraId, onClose }) {
  const [os, setOs] = useState(() =>
    navigator.platform.toLowerCase().includes("win") ? "windows" : "mac"
  );
  const [copiado, setCopiado] = useState(false);

  const idLower = (impresoraId || "imp").toLowerCase();
  const url = `https://www.atolon.co/cajas-imprimir?id=${impresoraId}`;

  const cmdMac = [
    `lpoptions -p Gainscha_GA_E200I -o media=Custom.72x72mm 2>/dev/null`,
    `pkill -f "Google Chrome" 2>/dev/null; killall "Google Chrome" 2>/dev/null`,
    `sleep 3`,
    `mkdir -p /tmp/atolon-kiosk-${idLower}`,
    `open -na "Google Chrome" --args --user-data-dir=/tmp/atolon-kiosk-${idLower} --kiosk-printing --new-window "${url}"`,
  ].join("\n");

  // /T mata el árbol completo (subprocesos), start "" desencadena Chrome del CMD.
  // Usamos `start "" chrome` (sin hardcodear ruta) — Windows resuelve Chrome via
  // App Paths registry, así funciona en Program Files, Program Files (x86) o
  // installs per-user.
  // Removidos los `>nul` y `2>nul` — el clipboard a veces mangela el `>`
  // cuando pasa por editores/autocorrectores. Los errores que muestre CMD
  // (ej. "process not found" si no había Chrome corriendo, o "directory
  // already exists" si la carpeta ya estaba) son inofensivos. Vale más
  // un comando feo pero confiable que uno limpio que falla en paste.
  const cmdWin = [
    `taskkill /F /IM chrome.exe /T`,
    `taskkill /F /IM "Google Chrome.exe" /T`,
    `timeout /t 4 /nobreak`,
    `mkdir "C:\\Temp\\atolon-kiosk-${idLower}"`,
    `start "" chrome --user-data-dir="C:\\Temp\\atolon-kiosk-${idLower}" --kiosk-printing --new-window "${url}"`,
  ].join("\r\n");

  const cmd = os === "mac" ? cmdMac : cmdWin;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = cmd; document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }
  };

  // .bat (Windows) y .command (Mac) — más robustos que copy-paste.
  // El .bat busca Chrome en las 3 ubicaciones comunes. El .command incluye
  // un shebang y se ejecuta cuando se le da chmod +x.
  const scriptWin = `@echo off
chcp 65001 >nul
echo === Atolon: lanzando Chrome silencioso para ${impresoraId} ===
echo.
echo Cerrando Chrome existente...
taskkill /F /IM chrome.exe /T 2>nul
taskkill /F /IM "Google Chrome.exe" /T 2>nul
timeout /t 3 /nobreak >nul

echo Buscando Chrome...
set "CHROME="
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"

if "%CHROME%"=="" (
  echo ERROR: No encontre Chrome instalado en este computador.
  echo Buscado en:
  echo   %ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe
  echo   %ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe
  echo   %LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe
  pause
  exit /b 1
)

echo Encontrado en: %CHROME%
mkdir "C:\\Temp\\atolon-kiosk-${idLower}" 2>nul
echo Lanzando con --kiosk-printing...
start "" "%CHROME%" --user-data-dir="C:\\Temp\\atolon-kiosk-${idLower}" --kiosk-printing --new-window "${url}"
echo.
echo Listo. Esta ventana se cierra en 3 segundos.
timeout /t 3 /nobreak >nul
`;

  const scriptMac = `#!/bin/bash
set -e
echo "=== Atolón: lanzando Chrome silencioso para ${impresoraId} ==="

# Configurar papel custom 72x72mm
if command -v lpoptions >/dev/null 2>&1; then
  lpoptions -p Gainscha_GA_E200I -o media=Custom.72x72mm 2>/dev/null || true
fi

echo "Cerrando Chrome existente..."
pkill -f "Google Chrome" 2>/dev/null || true
killall "Google Chrome" 2>/dev/null || true
sleep 3

mkdir -p "/tmp/atolon-kiosk-${idLower}"
echo "Lanzando con --kiosk-printing..."
open -na "Google Chrome" --args \\
  --user-data-dir="/tmp/atolon-kiosk-${idLower}" \\
  --kiosk-printing \\
  --new-window \\
  "${url}"

echo "Listo. Cerrando esta ventana en 2 segundos..."
sleep 2
`;

  const descargar = () => {
    const isMac = os === "mac";
    const content = isMac ? scriptMac : scriptWin;
    const filename = isMac
      ? `atolon-${idLower}.command`
      : `atolon-${idLower}.bat`;
    const blob = new Blob([content], {
      type: isMac ? "text/x-shellscript" : "application/x-bat",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: "#fff", color: "#0D1B3E",
        borderRadius: 16, padding: 32, maxWidth: 720, width: "100%",
        maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🔇 Configurar impresión silenciosa</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 28, cursor: "pointer", color: "#666",
            padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 20, color: "#444" }}>
          Esto reinicia Chrome con la bandera <code>--kiosk-printing</code> para que cada ticket
          se imprima sin mostrar el diálogo. <strong>Hacelo una sola vez por computador.</strong>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {[
            { v: "mac", l: "🍎 Mac" },
            { v: "windows", l: "🪟 Windows" },
          ].map(o => (
            <button key={o.v} onClick={() => setOs(o.v)} style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 800,
              background: os === o.v ? "#0D1B3E" : "#F3F4F6",
              color: os === o.v ? "#fff" : "#666",
              border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer",
            }}>{o.l}</button>
          ))}
        </div>

        {/* OPCIÓN 1 — Descargar script (recomendado) */}
        <div style={{
          background: "#E8F5E9", border: "2px solid #4CAF7D", borderRadius: 10,
          padding: 16, marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, color: "#2E7D32", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>
            ✅ OPCIÓN A — RECOMENDADA
          </div>
          <ol style={{ paddingLeft: 22, fontSize: 13, lineHeight: 1.7, color: "#333", margin: 0, marginBottom: 12 }}>
            {os === "mac" ? (
              <>
                <li>Toca <strong>"Descargar atajo"</strong> abajo → baja un archivo <code>atolon-{idLower}.command</code></li>
                <li>Abrí Terminal → tipea <code>chmod +x ~/Downloads/atolon-{idLower}.command</code> → Enter</li>
                <li><strong>Doble click</strong> al archivo en Downloads → Chrome se abre solo en modo silencioso</li>
              </>
            ) : (
              <>
                <li>Toca <strong>"Descargar atajo"</strong> abajo → baja un archivo <code>atolon-{idLower}.bat</code></li>
                <li>Abrí <strong>Downloads</strong> → <strong>Doble click</strong> al archivo .bat</li>
                <li>Aparece una ventana negra, busca Chrome, lo lanza silencioso. Se cierra sola.</li>
                <li>Si Windows muestra alerta "SmartScreen": <strong>"Más información" → "Ejecutar de todos modos"</strong></li>
              </>
            )}
          </ol>
          <button onClick={descargar} style={{
            width: "100%", padding: "14px",
            background: "#4CAF7D", color: "#fff", border: "none",
            borderRadius: 8, fontSize: 14, fontWeight: 900, letterSpacing: "0.05em",
            cursor: "pointer",
          }}>
            📥 DESCARGAR ATAJO {os === "mac" ? "(.command)" : "(.bat)"}
          </button>
        </div>

        {/* OPCIÓN 2 — Pegar comando (manual, fallback) */}
        <details style={{
          background: "#F7F9FC", border: "1px solid #E3E7EF", borderRadius: 10,
          padding: 12, marginBottom: 14,
        }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "#666", cursor: "pointer", letterSpacing: "0.06em" }}>
            ⚙️ OPCIÓN B — Pegar comando manual
          </summary>
          <ol style={{ paddingLeft: 22, fontSize: 13, lineHeight: 1.7, marginTop: 10, color: "#333", marginBottom: 10 }}>
            {os === "mac" ? (
              <>
                <li>Abrí <strong>Terminal</strong> (Cmd+Espacio → "Terminal")</li>
                <li>Toca "Copiar" abajo → pegá en Terminal → Enter</li>
              </>
            ) : (
              <>
                <li>Cerrá TODAS las Chrome</li>
                <li>Presioná Win ⊞ → escribí <strong>cmd</strong> (NO PowerShell) → Enter</li>
                <li>Toca "Copiar" → click derecho en CMD para pegar → Enter</li>
              </>
            )}
          </ol>
          <div style={{
            background: "#0D1B3E", color: "#FFF",
            padding: "12px 14px", borderRadius: 8,
            fontFamily: "monospace", fontSize: 11, lineHeight: 1.5,
            whiteSpace: "pre-wrap", wordBreak: "break-all",
            marginBottom: 10, maxHeight: 160, overflowY: "auto",
          }}>
            {cmd}
          </div>
          <button onClick={copiar} style={{
            width: "100%", padding: "10px",
            background: copiado ? "#4CAF7D" : "#666",
            color: "#fff", border: "none", borderRadius: 6,
            fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
            cursor: "pointer", transition: "background 0.2s",
          }}>
            {copiado ? "✓ COMANDO COPIADO" : "📋 Copiar comando"}
          </button>
        </details>

        <div style={{ marginTop: 6, padding: "12px 16px", background: "#FFF9E6", borderRadius: 8, fontSize: 12, color: "#8B5A00", lineHeight: 1.5 }}>
          <strong>Después de correr</strong>, esta pestaña se reemplaza por una NUEVA con
          <code> --kiosk-printing</code> activo. Trabajá con la nueva. La impresora debe ser
          la <strong>default</strong> del sistema.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, valor, color, sinBorde, pulsar }) {
  return (
    <div style={{
      padding: "26px 30px",
      borderRight: sinBorde ? "none" : `1px solid ${"rgba(255,255,255,0.16)"}`,
      animation: pulsar ? "pulse 1.4s ease-in-out infinite" : "none",
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "0.18em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 48, fontWeight: 900, color, marginTop: 6, lineHeight: 1, fontFamily: "monospace" }}>
        {valor}
      </div>
    </div>
  );
}

function FullScreenMsg({ color, icon, title, subtitle }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#0D1B3E", color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 40, textAlign: "center",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 80, marginBottom: 20 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 10, color }}>{title}</div>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", maxWidth: 540 }}>{subtitle}</div>
      <div style={{
        marginTop: 30, padding: "14px 22px",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 10, fontSize: 13, color: "rgba(255,255,255,0.7)", maxWidth: 560,
      }}>
        Ejemplo de URL correcta:<br/>
        <code style={{ fontFamily: "monospace", color: "#C8B99A" }}>
          https://www.atolon.co/cajas-imprimir?id=IMP-1
        </code>
      </div>
    </div>
  );
}
