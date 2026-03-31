import { useState, useEffect, useCallback } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const BANCOS = ["Bancolombia", "Davivienda", "BBVA", "Banco de Bogotá", "Nequi", "Daviplata", "Banco Popular", "Colpatria", "Itaú", "Otro"];
const TIPOS_CUENTA = ["Cuenta Corriente", "Cuenta de Ahorros"];

const EMPTY_CUENTA = { banco: "Bancolombia", tipo: "Cuenta Corriente", numero: "", titular: "", nit: "", predeterminada: false };

export default function Configuracion() {
  const [tab, setTab] = useState("negocio");
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Formulario negocio (sin tel_muelle — tiene su propio estado)
  const [negocio, setNegocio] = useState({ nombre_empresa: "", nit: "", telefono: "", email: "", direccion: "", ciudad: "", website: "" });

  // Teléfono de muelle — estado independiente para que nunca lo pise saveNegocio
  const [telMuelle,      setTelMuelle]      = useState("");
  const [savingMuelle,   setSavingMuelle]   = useState(false);
  const [savedMuelle,    setSavedMuelle]    = useState(false);

  // Cuentas bancarias
  const [cuentas, setCuentas] = useState([]);
  const [showAddCuenta, setShowAddCuenta] = useState(false);
  const [newCuenta, setNewCuenta] = useState({ ...EMPTY_CUENTA });

  // Integraciones
  const [wompiForm,    setWompiForm]    = useState({ pub_key: "", integrity_key: "" });
  const [stripeForm,   setStripeForm]   = useState({ pub_key: "", secret_key: "" });
  const [savingInt,    setSavingInt]    = useState(null);   // "wompi" | "stripe" | null
  const [showWompi,    setShowWompi]    = useState(false);
  const [showStripe,   setShowStripe]   = useState(false);
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showWompiInt,     setShowWompiInt]     = useState(false);

  // Llaves desde .env.local como fallback
  const ENV_WOMPI_PUB       = import.meta.env.VITE_WOMPI_PUB_KEY        || "";
  const ENV_WOMPI_INTEGRITY = import.meta.env.VITE_WOMPI_INTEGRITY_KEY  || "";

  const fetchConfig = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("configuracion").select("*").eq("id", "atolon").single();
    if (data) {
      // Si la DB no tiene llaves Wompi pero sí existen en .env, migrarlas automáticamente
      if (!data.wompi_pub_key && ENV_WOMPI_PUB) {
        await supabase.from("configuracion").update({
          wompi_pub_key: ENV_WOMPI_PUB,
          wompi_integrity_key: ENV_WOMPI_INTEGRITY,
        }).eq("id", "atolon");
        data.wompi_pub_key = ENV_WOMPI_PUB;
        data.wompi_integrity_key = ENV_WOMPI_INTEGRITY;
      }
      setConfig(data);
      setNegocio({ nombre_empresa: data.nombre_empresa || "", nit: data.nit || "", telefono: data.telefono || "", email: data.email || "", direccion: data.direccion || "", ciudad: data.ciudad || "", website: data.website || "" });
      setTelMuelle(data.tel_muelle || "");
      setCuentas(data.cuentas_bancarias || []);
      setWompiForm({ pub_key: data.wompi_pub_key || "", integrity_key: data.wompi_integrity_key || "" });
      setStripeForm({ pub_key: data.stripe_pub_key || "", secret_key: data.stripe_secret_key || "" });
    }
    setLoading(false);
  }, [ENV_WOMPI_PUB, ENV_WOMPI_INTEGRITY]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveNegocio = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    await supabase.from("configuracion").update({
      nombre_empresa: negocio.nombre_empresa || null,
      nit:            negocio.nit            || null,
      telefono:       negocio.telefono       || null,
      email:          negocio.email          || null,
      direccion:      negocio.direccion      || null,
      ciudad:         negocio.ciudad         || null,
      website:        negocio.website        || null,
      // Guardar muelle junto con negocio para que nunca se pierda
      tel_muelle:     telMuelle.trim()       || null,
      updated_at:     new Date().toISOString(),
    }).eq("id", "atolon");
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const saveTelMuelle = async () => {
    if (!supabase || savingMuelle) return;
    setSavingMuelle(true);
    await supabase.from("configuracion").update({
      tel_muelle: telMuelle.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", "atolon");
    setSavingMuelle(false); setSavedMuelle(true); setTimeout(() => setSavedMuelle(false), 2500);
  };

  const saveCuentas = async (newList) => {
    if (!supabase) return;
    await supabase.from("configuracion").update({ cuentas_bancarias: newList, updated_at: new Date().toISOString() }).eq("id", "atolon");
    setCuentas(newList);
  };

  const addCuenta = async () => {
    if (!newCuenta.numero.trim() || !newCuenta.titular.trim()) return;
    const updated = [...cuentas, { ...newCuenta, id: `CUENTA-${Date.now()}` }];
    await saveCuentas(updated);
    setNewCuenta({ ...EMPTY_CUENTA }); setShowAddCuenta(false);
  };

  const deleteCuenta = async (id) => {
    await saveCuentas(cuentas.filter(c => c.id !== id));
  };

  const setPredeterminada = async (id) => {
    await saveCuentas(cuentas.map(c => ({ ...c, predeterminada: c.id === id })));
  };

  const saveWompi = async () => {
    if (!supabase || savingInt) return;
    setSavingInt("wompi");
    await supabase.from("configuracion").update({ wompi_pub_key: wompiForm.pub_key.trim(), wompi_integrity_key: wompiForm.integrity_key.trim(), updated_at: new Date().toISOString() }).eq("id", "atolon");
    await fetchConfig();
    setSavingInt(null); setShowWompi(false);
  };

  const disconnectWompi = async () => {
    if (!supabase || !window.confirm("¿Desconectar Wompi? Los pagos en línea colombianos dejarán de funcionar.")) return;
    setSavingInt("wompi");
    await supabase.from("configuracion").update({ wompi_pub_key: null, wompi_integrity_key: null, updated_at: new Date().toISOString() }).eq("id", "atolon");
    setWompiForm({ pub_key: "", integrity_key: "" });
    await fetchConfig();
    setSavingInt(null);
  };

  const saveStripe = async () => {
    if (!supabase || savingInt) return;
    setSavingInt("stripe");
    await supabase.from("configuracion").update({ stripe_pub_key: stripeForm.pub_key.trim(), stripe_secret_key: stripeForm.secret_key.trim(), updated_at: new Date().toISOString() }).eq("id", "atolon");
    await fetchConfig();
    setSavingInt(null); setShowStripe(false);
  };

  const disconnectStripe = async () => {
    if (!supabase || !window.confirm("¿Desconectar Stripe? Los pagos internacionales dejarán de funcionar.")) return;
    setSavingInt("stripe");
    await supabase.from("configuracion").update({ stripe_pub_key: null, stripe_secret_key: null, updated_at: new Date().toISOString() }).eq("id", "atolon");
    setStripeForm({ pub_key: "", secret_key: "" });
    await fetchConfig();
    setSavingInt(null);
  };

  const TABS = [
    { key: "negocio", label: "🏢 Negocio" },
    { key: "cuentas", label: "🏦 Cuentas Bancarias" },
    { key: "integraciones", label: "🔌 Integraciones" },
    { key: "widget", label: "🌐 Widget Web" },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Configuración</h2>
        {supabase && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 400, background: tab === t.key ? B.navy : "transparent", color: tab === t.key ? B.white : "rgba(255,255,255,0.5)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: NEGOCIO ─────────────────────────────────────────── */}
      {tab === "negocio" && (
        <>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 28 }}>
          <h3 style={{ fontSize: 16, color: B.sand, marginBottom: 20 }}>Datos del negocio</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Nombre de la empresa</label>
              <input value={negocio.nombre_empresa} onChange={e => setNegocio(n => ({ ...n, nombre_empresa: e.target.value }))} style={{ ...IS, fontSize: 15 }} placeholder="Atolon Beach Club SAS" />
            </div>
            <div>
              <label style={LS}>NIT</label>
              <input value={negocio.nit} onChange={e => setNegocio(n => ({ ...n, nit: e.target.value }))} style={IS} placeholder="901.xxx.xxx-0" />
            </div>
            <div>
              <label style={LS}>Teléfono</label>
              <input value={negocio.telefono} onChange={e => setNegocio(n => ({ ...n, telefono: e.target.value }))} style={IS} placeholder="+57 300 000 0000" />
            </div>
            <div>
              <label style={LS}>Email</label>
              <input value={negocio.email} onChange={e => setNegocio(n => ({ ...n, email: e.target.value }))} style={IS} placeholder="info@atolon.co" />
            </div>
            <div>
              <label style={LS}>Ciudad</label>
              <input value={negocio.ciudad} onChange={e => setNegocio(n => ({ ...n, ciudad: e.target.value }))} style={IS} placeholder="Cartagena de Indias" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Dirección</label>
              <input value={negocio.direccion} onChange={e => setNegocio(n => ({ ...n, direccion: e.target.value }))} style={IS} placeholder="Bocachico, Isla Tierra Bomba..." />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Website</label>
              <input value={negocio.website} onChange={e => setNegocio(n => ({ ...n, website: e.target.value }))} style={IS} placeholder="https://atolon.co" />
            </div>
          </div>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={saveNegocio} disabled={saving}
              style={{ padding: "12px 28px", background: saved ? B.success : B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar cambios"}
            </button>
          </div>
        </div>

        {/* ── Teléfono muelle — tarjeta independiente ── */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 28, marginTop: 16 }}>
          <h3 style={{ fontSize: 15, color: B.sand, marginBottom: 6 }}>⚓ Asistencia en muelle</h3>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>Número que aparece en el portal de agencias. Se guarda de forma independiente.</p>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              value={telMuelle}
              onChange={e => setTelMuelle(e.target.value)}
              placeholder="+57 300 000 0000"
              style={{ ...IS, flex: 1 }}
            />
            <button onClick={saveTelMuelle} disabled={savingMuelle}
              style={{ padding: "11px 24px", background: savedMuelle ? B.success : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
              {savingMuelle ? "Guardando..." : savedMuelle ? "✓ Guardado" : "Guardar"}
            </button>
          </div>
        </div>
        </>
      )}

      {/* ── TAB: CUENTAS BANCARIAS ────────────────────────────────── */}
      {tab === "cuentas" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, color: B.sand }}>Cuentas bancarias</h3>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>La cuenta <strong style={{ color: B.sand }}>predeterminada</strong> se muestra en el modal de transferencia al hacer reservas</p>
            </div>
            <button onClick={() => setShowAddCuenta(true)} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Nueva cuenta</button>
          </div>

          {cuentas.length === 0 && (
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              No hay cuentas registradas — agrega una para mostrarla en los pagos por transferencia
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cuentas.map(c => (
              <div key={c.id} style={{ background: B.navyMid, borderRadius: 12, padding: "18px 22px", border: `2px solid ${c.predeterminada ? B.sand : B.navyLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{c.banco}</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: B.navyLight, color: "rgba(255,255,255,0.5)" }}>{c.tipo}</span>
                      {c.predeterminada && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: B.sand + "22", color: B.sand }}>★ Predeterminada</span>}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 2, color: "rgba(255,255,255,0.7)" }}>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Número: </span><strong style={{ color: B.sky }}>{c.numero}</strong></div>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Titular: </span>{c.titular}</div>
                      {c.nit && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>NIT/CC: </span>{c.nit}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {!c.predeterminada && (
                      <button onClick={() => setPredeterminada(c.id)} style={{ fontSize: 11, padding: "5px 10px", background: B.sand + "22", color: B.sand, border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>★ Predeterminar</button>
                    )}
                    <button onClick={() => deleteCuenta(c.id)} style={{ fontSize: 11, padding: "5px 10px", background: B.danger + "22", color: B.danger, border: "none", borderRadius: 6, cursor: "pointer" }}>Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Formulario nueva cuenta */}
          {showAddCuenta && (
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, marginTop: 16, border: `1px solid ${B.sand + "44"}` }}>
              <h4 style={{ fontSize: 15, color: B.sand, marginBottom: 18 }}>Nueva cuenta bancaria</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={LS}>Banco</label>
                  <select value={newCuenta.banco} onChange={e => setNewCuenta(c => ({ ...c, banco: e.target.value }))} style={{ ...IS }}>
                    {BANCOS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Tipo de cuenta</label>
                  <select value={newCuenta.tipo} onChange={e => setNewCuenta(c => ({ ...c, tipo: e.target.value }))} style={{ ...IS }}>
                    {TIPOS_CUENTA.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Número de cuenta</label>
                  <input value={newCuenta.numero} onChange={e => setNewCuenta(c => ({ ...c, numero: e.target.value }))} style={IS} placeholder="123-456789-00" />
                </div>
                <div>
                  <label style={LS}>Titular</label>
                  <input value={newCuenta.titular} onChange={e => setNewCuenta(c => ({ ...c, titular: e.target.value }))} style={IS} placeholder="Atolon Beach Club SAS" />
                </div>
                <div>
                  <label style={LS}>NIT / Cédula</label>
                  <input value={newCuenta.nit} onChange={e => setNewCuenta(c => ({ ...c, nit: e.target.value }))} style={IS} placeholder="901.xxx.xxx-0" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
                  <input type="checkbox" id="pred" checked={newCuenta.predeterminada} onChange={e => setNewCuenta(c => ({ ...c, predeterminada: e.target.checked }))} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  <label htmlFor="pred" style={{ fontSize: 13, cursor: "pointer" }}>Usar como predeterminada</label>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={() => { setShowAddCuenta(false); setNewCuenta({ ...EMPTY_CUENTA }); }} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={addCuenta} disabled={!newCuenta.numero.trim() || !newCuenta.titular.trim()} style={{ flex: 2, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Guardar cuenta</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: INTEGRACIONES ───────────────────────────────────── */}
      {tab === "integraciones" && (() => {
        const wompiConectado = !!(config?.wompi_pub_key);
        const stripeConectado = !!(config?.stripe_pub_key);
        const mask = (s) => s ? s.slice(0, 8) + "••••••••••••" + s.slice(-4) : "";

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── WOMPI ────────────────────────────────────────────── */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 22, border: `1px solid ${wompiConectado ? "#5B4CF5" + "44" : B.navyLight}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: "#fff", flexShrink: 0 }}>W</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Wompi</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Pagos con tarjeta Colombia · PSE · Nequi · Bancolombia</div>
                </div>
                <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 10, background: wompiConectado ? B.success + "22" : B.navyLight, color: wompiConectado ? B.success : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                  {wompiConectado ? "✓ Conectado" : "Sin configurar"}
                </span>
                {wompiConectado
                  ? <button onClick={disconnectWompi} disabled={savingInt === "wompi"} style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Desconectar</button>
                  : <button onClick={() => setShowWompi(v => !v)} style={{ background: "#5B4CF5", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Conectar</button>
                }
                {wompiConectado && <button onClick={() => setShowWompi(v => !v)} style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Editar</button>}
              </div>

              {/* Llaves actuales */}
              {wompiConectado && !showWompi && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                  <div>
                    <label style={LS}>Llave pública</label>
                    <div style={{ padding: "10px 14px", background: B.navy, borderRadius: 8, fontSize: 12, color: B.sky, fontFamily: "monospace" }}>{mask(config.wompi_pub_key)}</div>
                  </div>
                  <div>
                    <label style={LS}>Llave de integridad</label>
                    <div style={{ padding: "10px 14px", background: B.navy, borderRadius: 8, fontSize: 12, color: B.success, fontFamily: "monospace" }}>••••••••••••••••••••</div>
                  </div>
                </div>
              )}

              {/* Formulario conectar/editar */}
              {showWompi && (
                <div style={{ marginTop: 20, padding: 20, background: B.navy, borderRadius: 10, border: `1px solid #5B4CF5` + "44" }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.6 }}>
                    Obtén tus llaves en <strong style={{ color: "#a99bf5" }}>dashboard.wompi.co</strong> → Desarrolladores → Llaves de API.<br />
                    Usa llaves de <strong style={{ color: B.warning }}>producción</strong> (prefijo <code style={{ background: B.navyLight, padding: "1px 5px", borderRadius: 4 }}>pub_prod_</code> / <code style={{ background: B.navyLight, padding: "1px 5px", borderRadius: 4 }}>prod_integrity_</code>).
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={LS}>Llave pública <span style={{ color: "rgba(255,255,255,0.3)" }}>(pub_prod_...)</span></label>
                      <input value={wompiForm.pub_key} onChange={e => setWompiForm(f => ({ ...f, pub_key: e.target.value }))}
                        placeholder="pub_prod_xxxxxxxxxxxxxxxxxxxxxxxx"
                        style={{ ...IS, fontFamily: "monospace", fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={LS}>Llave de integridad <span style={{ color: "rgba(255,255,255,0.3)" }}>(prod_integrity_...)</span></label>
                      <div style={{ position: "relative" }}>
                        <input type={showWompiInt ? "text" : "password"} value={wompiForm.integrity_key} onChange={e => setWompiForm(f => ({ ...f, integrity_key: e.target.value }))}
                          placeholder="prod_integrity_xxxxxxxxxxxxxxxxxxxxxxxx"
                          style={{ ...IS, fontFamily: "monospace", fontSize: 12, paddingRight: 80 }} />
                        <button onClick={() => setShowWompiInt(v => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>{showWompiInt ? "Ocultar" : "Ver"}</button>
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: B.warning + "11", borderRadius: 8, border: `1px solid ${B.warning}22`, fontSize: 12, color: B.warning }}>
                      ⚠️ Las llaves se guardan en la base de datos. Usa HTTPS en producción.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button onClick={() => setShowWompi(false)} style={{ flex: 1, padding: "10px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                    <button onClick={saveWompi} disabled={savingInt === "wompi" || !wompiForm.pub_key.trim() || !wompiForm.integrity_key.trim()}
                      style={{ flex: 2, padding: "10px", background: savingInt === "wompi" ? B.navyLight : "#5B4CF5", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      {savingInt === "wompi" ? "Guardando..." : wompiConectado ? "Actualizar llaves" : "Conectar Wompi"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── STRIPE ───────────────────────────────────────────── */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 22, border: `1px solid ${stripeConectado ? "#635BFF" + "44" : B.navyLight}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: "#fff", flexShrink: 0 }}>S</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Stripe</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Pagos internacionales · Visa · Mastercard · Amex</div>
                </div>
                <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 10, background: stripeConectado ? B.success + "22" : B.navyLight, color: stripeConectado ? B.success : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                  {stripeConectado ? "✓ Conectado" : "Sin configurar"}
                </span>
                {stripeConectado
                  ? <button onClick={disconnectStripe} disabled={savingInt === "stripe"} style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Desconectar</button>
                  : <button onClick={() => setShowStripe(v => !v)} style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Conectar</button>
                }
                {stripeConectado && <button onClick={() => setShowStripe(v => !v)} style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Editar</button>}
              </div>

              {/* Llaves actuales */}
              {stripeConectado && !showStripe && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                  <div>
                    <label style={LS}>Llave pública</label>
                    <div style={{ padding: "10px 14px", background: B.navy, borderRadius: 8, fontSize: 12, color: "#a5b4fc", fontFamily: "monospace" }}>{mask(config.stripe_pub_key)}</div>
                  </div>
                  <div>
                    <label style={LS}>Llave secreta</label>
                    <div style={{ padding: "10px 14px", background: B.navy, borderRadius: 8, fontSize: 12, color: B.success, fontFamily: "monospace" }}>••••••••••••••••••••</div>
                  </div>
                </div>
              )}

              {/* Formulario conectar/editar */}
              {showStripe && (
                <div style={{ marginTop: 20, padding: 20, background: B.navy, borderRadius: 10, border: `1px solid #635BFF44` }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.6 }}>
                    Obtén tus llaves en <strong style={{ color: "#a5b4fc" }}>dashboard.stripe.com</strong> → Developers → API keys.<br />
                    Usa llaves <strong style={{ color: B.warning }}>Live</strong> en producción (prefijo <code style={{ background: B.navyLight, padding: "1px 5px", borderRadius: 4 }}>pk_live_</code> / <code style={{ background: B.navyLight, padding: "1px 5px", borderRadius: 4 }}>sk_live_</code>).
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={LS}>Llave pública <span style={{ color: "rgba(255,255,255,0.3)" }}>(pk_live_...)</span></label>
                      <input value={stripeForm.pub_key} onChange={e => setStripeForm(f => ({ ...f, pub_key: e.target.value }))}
                        placeholder="pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        style={{ ...IS, fontFamily: "monospace", fontSize: 12 }} />
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Se usa en el navegador del cliente para renderizar el formulario de pago.</div>
                    </div>
                    <div>
                      <label style={LS}>Llave secreta <span style={{ color: "rgba(255,255,255,0.3)" }}>(sk_live_...)</span></label>
                      <div style={{ position: "relative" }}>
                        <input type={showStripeSecret ? "text" : "password"} value={stripeForm.secret_key} onChange={e => setStripeForm(f => ({ ...f, secret_key: e.target.value }))}
                          placeholder="sk_live_..."
                          style={{ ...IS, fontFamily: "monospace", fontSize: 12, paddingRight: 80 }} />
                        <button onClick={() => setShowStripeSecret(v => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>{showStripeSecret ? "Ocultar" : "Ver"}</button>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Se usa en el servidor (Supabase Edge Function) para crear el PaymentIntent. Nunca se expone al cliente.</div>
                    </div>
                    <div style={{ padding: "10px 14px", background: B.warning + "11", borderRadius: 8, border: `1px solid ${B.warning}22`, fontSize: 12, color: B.warning }}>
                      ⚠️ La llave secreta tiene acceso total a tu cuenta Stripe. Guárdala solo aquí y nunca en el código fuente.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button onClick={() => setShowStripe(false)} style={{ flex: 1, padding: "10px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                    <button onClick={saveStripe} disabled={savingInt === "stripe" || !stripeForm.pub_key.trim() || !stripeForm.secret_key.trim()}
                      style={{ flex: 2, padding: "10px", background: savingInt === "stripe" ? B.navyLight : "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      {savingInt === "stripe" ? "Guardando..." : stripeConectado ? "Actualizar llaves" : "Conectar Stripe"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── SUPABASE ─────────────────────────────────────────── */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#3ECF8E", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff" }}>SB</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Supabase</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Base de datos · Storage · Autenticación</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 11, padding: "3px 12px", borderRadius: 10, background: supabase ? B.success + "22" : B.danger + "22", color: supabase ? B.success : B.danger }}>
                  {supabase ? "✓ Conectado" : "Sin conexión"}
                </span>
              </div>
              <div style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.7 }}>
                Configurado vía variables de entorno. Para cambiar el proyecto edita <code style={{ background: B.navy, padding: "1px 5px", borderRadius: 4 }}>.env.local</code> → <code style={{ background: B.navy, padding: "1px 5px", borderRadius: 4 }}>VITE_SUPABASE_URL</code> y <code style={{ background: B.navy, padding: "1px 5px", borderRadius: 4 }}>VITE_SUPABASE_ANON_KEY</code>.
              </div>
            </div>

          </div>
        );
      })()}

      {/* ── TAB: WIDGET WEB ──────────────────────────────────────── */}
      {tab === "widget" && (() => {
        const baseUrl = window.location.origin;
        const PRODUCTS_W = [
          { slug: "vip-pass",          tipo: "VIP Pass",          icon: "🌴" },
          { slug: "exclusive-pass",    tipo: "Exclusive Pass",    icon: "⭐" },
          { slug: "atolon-experience", tipo: "Atolon Experience", icon: "🛥️" },
          { slug: "after-island",      tipo: "After Island",      icon: "🌙" },
        ];
        const [copied, setCopied] = useState({});
        const doCopy = (key, text) => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(c => ({ ...c, [key]: true }));
            setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
          });
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 22 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🌐 Popup de Reservas para tu Página Web</h3>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 0 }}>
                Copia el código de cada producto y pégalo en tu página web. Al hacer clic en el botón se abre el popup de reserva directamente conectado a Atolon OS y Wompi.
              </p>
            </div>

            {/* Preview link */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: B.sand }}>🔍 Vista previa del widget</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {PRODUCTS_W.map(p => (
                  <a key={p.slug} href={`${baseUrl}/booking?tipo=${p.slug}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, background: B.navyLight, color: B.sky, textDecoration: "none", border: `1px solid ${B.navyLight}` }}>
                    {p.icon} Ver widget {p.tipo} ↗
                  </a>
                ))}
              </div>
            </div>

            {/* Per-product embed codes */}
            {PRODUCTS_W.map(p => {
              const widgetUrl = `${baseUrl}/booking?tipo=${p.slug}`;
              const iframeCode = `<!-- Widget Atolon: ${p.tipo} -->
<div id="atolon-widget-${p.slug}" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;">
  <div style="position:relative;width:100%;max-width:520px;max-height:90vh;overflow:auto;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
    <button onclick="document.getElementById('atolon-widget-${p.slug}').style.display='none'"
      style="position:absolute;top:12px;right:12px;z-index:10;background:rgba(0,0,0,0.4);border:none;color:white;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1;">✕</button>
    <iframe src="${widgetUrl}" width="100%" height="680" frameborder="0" style="border-radius:16px;display:block;" loading="lazy"></iframe>
  </div>
</div>

<!-- Botón que abre el popup -->
<button onclick="document.getElementById('atolon-widget-${p.slug}').style.display='flex'"
  style="background:#0D1B3E;color:white;border:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:0.02em;">
  🌴 Reservar ${p.tipo}
</button>`;

              return (
                <div key={p.slug} style={{ background: B.navyMid, borderRadius: 12, padding: 20, border: `1px solid ${B.navyLight}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{p.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.tipo}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{widgetUrl}</div>
                      </div>
                    </div>
                    <button onClick={() => doCopy(p.slug, iframeCode)}
                      style={{ background: copied[p.slug] ? B.success : B.navyLight, color: copied[p.slug] ? "#fff" : B.sand, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      {copied[p.slug] ? "✓ Copiado!" : "📋 Copiar código"}
                    </button>
                  </div>
                  <pre style={{ background: B.navy, borderRadius: 8, padding: "14px 16px", fontSize: 11, color: B.sky, lineHeight: 1.6, overflowX: "auto", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 140, overflow: "auto" }}>{iframeCode}</pre>
                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                    Pega este código en el HTML de tu página donde quieras que aparezca el botón de reserva. El popup se abre sobre tu página sin redirigir al usuario.
                  </div>
                </div>
              );
            })}

            {/* Instructions */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: B.sand }}>📌 Instrucciones</div>
              <ol style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 2, paddingLeft: 20, margin: 0 }}>
                <li>Copia el código del producto que quieres mostrar</li>
                <li>Pégalo en el HTML de tu página web (WordPress, Wix, Webflow, etc.)</li>
                <li>El botón abrirá un popup con el widget de reserva</li>
                <li>El cliente selecciona fecha, pax y paga con Wompi directamente</li>
                <li>La reserva queda registrada en Atolon OS automáticamente</li>
              </ol>
              <div style={{ marginTop: 12, padding: "10px 14px", background: B.warning + "15", borderRadius: 8, border: `1px solid ${B.warning}33`, fontSize: 12, color: B.warning }}>
                ⚠️ Asegúrate de que tu dominio está publicado en HTTPS para que el widget funcione correctamente.
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
