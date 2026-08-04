import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, TAG, EMPTY, BTN } from "./_shared.jsx";

const PROVIDERS = [
  { k: "loggro", l: "Loggro POS", icon: "🍽️" },
  { k: "cloudbeds", l: "Cloudbeds PMS", icon: "🏨" },
  { k: "stripe", l: "Stripe", icon: "💳" },
  { k: "wompi", l: "Wompi", icon: "💰" },
  { k: "zoho_pay", l: "Zoho Pay", icon: "💵" },
];

export default function Integrations({ tenantId }) {
  const [rows, setRows] = useState([]);
  const load = () => supabase.from("ai_integrations").select("*").eq("tenant_id", tenantId).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [tenantId]);

  const add = async (p) => {
    await supabase.from("ai_integrations").insert({ id: `IN-${Date.now()}`, tenant_id: tenantId, proveedor: p.k, nombre: p.l });
    load();
  };
  const toggle = async (r) => { await supabase.from("ai_integrations").update({ activo: !r.activo }).eq("id", r.id); load(); };

  return (
    <div style={{ padding: 20 }}>
      <HEADER title="🔌 Integraciones" subtitle="Conecta datos vivos (POS, PMS, pagos) para que el agente los use" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
        {PROVIDERS.map(p => {
          const conn = rows.find(r => r.proveedor === p.k);
          return (
            <div key={p.k} style={{ ...CARD, textAlign: "center" }}>
              <div style={{ fontSize: 24 }}>{p.icon}</div>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 4 }}>{p.l}</div>
              {conn ? (
                <>
                  <div style={{ marginTop: 6 }}>{TAG(conn.health === "active" ? B.success : B.warning, conn.health)}</div>
                  <button onClick={() => toggle(conn)} style={{ ...BTN(conn.activo ? B.danger : B.success), marginTop: 8, fontSize: 10 }}>
                    {conn.activo ? "Desactivar" : "Activar"}
                  </button>
                </>
              ) : (
                <button onClick={() => add(p)} style={{ ...BTN(B.sky, B.navy), marginTop: 8, fontSize: 10 }}>+ Conectar</button>
              )}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && <EMPTY icon="🔌" text="Selecciona un proveedor arriba para conectarlo" />}
    </div>
  );
}
