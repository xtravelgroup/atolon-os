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
  const procesadosRef = useRef(new Set()); // evita doble-print si llega 2x

  useEffect(() => {
    if (!impresoraId) { setError("Falta el parámetro ?id=IMP-N en la URL"); return; }
    if (!supabase) { setError("Supabase no disponible"); return; }

    let alive = true;
    let canal;

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
      const { data: pendientes } = await supabase
        .from("cajas_evento_impresion_queue")
        .select("*")
        .eq("impresora_id", impresoraId)
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: true })
        .limit(20);
      (pendientes || []).forEach(job => imprimirJob(job));

      // 2) Suscribirse a INSERTs nuevos
      canal = supabase.channel(`imp-${impresoraId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "cajas_evento_impresion_queue",
          filter: `impresora_id=eq.${impresoraId}`,
        }, payload => imprimirJob(payload.new))
        .subscribe();
    })();

    return () => { alive = false; if (canal) supabase.removeChannel(canal); };
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
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "10px 18px", background: C.green + "33",
              border: `2px solid ${C.green}`, borderRadius: 30,
              fontSize: 14, fontWeight: 800, letterSpacing: "0.1em",
            }}>
              <span style={{
                display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                background: C.green, animation: "pulse 1.4s ease-in-out infinite",
              }} />
              ESCUCHANDO
            </div>
            <div style={{ fontSize: 11, color: C.textLow, marginTop: 10, fontFamily: "monospace" }}>
              {impresora.id}
            </div>
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
        <span>⚠ Dejá esta pestaña abierta todo el evento. Chrome con --kiosk-printing imprime sin diálogo.</span>
        <span>Papel: 72×72mm · DIG-E200I</span>
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
