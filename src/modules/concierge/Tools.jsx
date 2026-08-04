import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, TAG, EMPTY } from "./_shared.jsx";

export default function Tools({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => { supabase.from("ai_tools").select("*").eq("tenant_id", tenantId).then(({ data }) => setRows(data || [])); }, [tenantId]);
  const toggle = async (r) => { await supabase.from("ai_tools").update({ activo: !r.activo }).eq("id", r.id); const { data } = await supabase.from("ai_tools").select("*").eq("tenant_id", tenantId); setRows(data || []); };
  return (
    <div style={{ padding: 20 }}>
      <HEADER title="🛠️ Tools" subtitle="Herramientas que Claude puede invocar (tool-use) contra tus datos vivos" />
      {rows.length === 0 ? <EMPTY icon="🛠️" text="No hay tools registradas" /> : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map(r => (
            <div key={r.id} style={{ ...CARD }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{r.nombre}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{r.descripcion}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {r.is_builtin && TAG(B.sky, "Builtin")}
                    {TAG(B.sand, r.endpoint)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={r.activo} onChange={() => toggle(r)} />
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} style={{ background: "transparent", border: `1px solid ${B.navyLight}`, color: B.sky, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                    {open === r.id ? "Ocultar" : "Ver schema"}
                  </button>
                </div>
              </div>
              {open === r.id && (
                <pre style={{ marginTop: 12, background: B.navy, padding: 12, borderRadius: 6, fontSize: 11, color: "#8ec5fc", overflowX: "auto" }}>
                  {JSON.stringify(r.input_schema, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
