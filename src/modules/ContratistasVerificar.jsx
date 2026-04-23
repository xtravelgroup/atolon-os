// Verificación pública de certificado — /verificar/:code
// STUB Fase 1 — funcional básico.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const C = { navy: "#0D1B3E", sand: "#C8B99A", sky: "#8ECAE6", cream: "#FAF6EE", success: "#4CAF7D", danger: "#D64545" };

export default function ContratistasVerificar({ code }) {
  const [cert, setCert] = useState(null);
  const [trabajador, setTrabajador] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!code) { setLoading(false); return; }
      const { data: c } = await supabase.from("certificados_curso")
        .select("id, codigo, cedula, nombre, expires_at, passed, score, trabajador_id, created_at")
        .eq("codigo", code).maybeSingle();
      setCert(c);
      if (c?.trabajador_id) {
        const { data: t } = await supabase.from("contratistas_trabajadores")
          .select("id, nombre, cedula, contratista_id").eq("id", c.trabajador_id).maybeSingle();
        setTrabajador(t);
      }
      setLoading(false);
    })();
  }, [code]);

  const vigente = cert && cert.passed && (!cert.expires_at || new Date(cert.expires_at) > new Date());

  return (
    <div style={{ minHeight: "100vh", background: C.cream, fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "white", borderRadius: 16, padding: 40, maxWidth: 560, width: "100%", boxShadow: "0 20px 60px rgba(13,27,62,0.15)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.sand, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>
            Atolón Beach Club
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, color: C.navy, margin: 0 }}>
            Verificación de Certificado SST
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#666" }}>Verificando…</div>
        ) : !cert ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.danger, marginBottom: 6 }}>Certificado no encontrado</div>
            <div style={{ fontSize: 13, color: "#666" }}>El código <code style={{ background: "#f0f0f0", padding: "2px 8px", borderRadius: 4 }}>{code || "—"}</code> no es válido.</div>
          </div>
        ) : (
          <div>
            <div style={{ padding: 20, background: (vigente ? C.success : C.danger) + "15", border: `2px solid ${vigente ? C.success : C.danger}`, borderRadius: 12, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 32 }}>{vigente ? "✓" : "⚠️"}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: vigente ? C.success : C.danger }}>
                    {vigente ? "CERTIFICADO VIGENTE" : cert.passed ? "CERTIFICADO VENCIDO" : "CURSO NO APROBADO"}
                  </div>
                  {cert.expires_at && (
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Vigencia hasta: <strong>{new Date(cert.expires_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <dl style={{ margin: 0, fontSize: 13 }}>
              {[
                ["Código", cert.codigo],
                ["Nombre", cert.nombre || trabajador?.nombre || "—"],
                ["Cédula", cert.cedula || trabajador?.cedula || "—"],
                ["Puntaje", cert.score != null ? `${cert.score}%` : "—"],
                ["Emisión", new Date(cert.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                  <dt style={{ color: "#666", fontWeight: 600 }}>{k}</dt>
                  <dd style={{ margin: 0, color: C.navy, fontWeight: 600, textAlign: "right" }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div style={{ marginTop: 20, padding: "12px 16px", background: C.cream, borderRadius: 8, fontSize: 11, color: "#666", textAlign: "center", lineHeight: 1.6 }}>
          Atolón Beach Club · Cartagena de Indias<br/>
          <a href="/contratistas" style={{ color: C.navy }}>Portal de Contratistas</a>
        </div>
      </div>
    </div>
  );
}
