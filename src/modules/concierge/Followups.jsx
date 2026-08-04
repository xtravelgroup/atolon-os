import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, TAG, EMPTY } from "./_shared.jsx";

export default function Followups({ tenantId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    supabase.from("ai_followups").select("*").eq("tenant_id", tenantId).order("programado_para").limit(200)
      .then(({ data }) => setRows(data || []));
  }, [tenantId]);
  return (
    <div style={{ padding: 20 }}>
      <HEADER title="🔄 Follow-ups" subtitle="Recuperación automática de leads sin responder" />
      {rows.length === 0 ? <EMPTY icon="🔄" text="Sin follow-ups programados" /> : (
        <div style={CARD}>
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: B.sand, textTransform: "uppercase", fontSize: 10, textAlign: "left" }}>
                <th style={{ padding: 8 }}>Contacto</th><th>Motivo</th><th>Programado</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}`, color: "#fff" }}>
                  <td style={{ padding: 10 }}>{r.conversation_id}</td>
                  <td style={{ fontSize: 11 }}>{r.motivo}</td>
                  <td style={{ fontSize: 11 }}>{new Date(r.programado_para).toLocaleString("es-CO")}</td>
                  <td>{TAG(r.estado === "ejecutado" ? B.success : r.estado === "cancelado" ? B.danger : B.warning, r.estado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
