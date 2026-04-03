import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const NACS = [
  // Prioritarias
  "Colombiana", "Americana", "Mexicana", "Ecuatoriana", "Peruana",
  "Española", "Chilena", "Brasileña", "Argentina", "Francesa", "Alemana",
  // Resto mundo — orden alfabético
  "Afgana", "Albanesa", "Andorrana", "Angoleña", "Antiguense",
  "Argelina", "Armenia", "Australiana", "Austriaca", "Azerbaiyana",
  "Bahameña", "Bangladesí", "Barbadense", "Bareiní", "Belga", "Beliceña",
  "Beninesa", "Bielorrusa", "Birmana", "Boliviana", "Bosnia", "Botsuanesa",
  "Británica", "Bruneana", "Búlgara", "Burkinesa", "Burundesa",
  "Butanesa", "Caboverdiana", "Camboyana", "Camerunesa", "Canadiense",
  "Catarí", "Chadiana", "Checa", "China", "Chipriota", "Congoleña",
  "Costarricense", "Croata", "Cubana", "Danesa", "Dominicana",
  "Egipcia", "Salvadoreña", "Emiratense", "Eritrea", "Eslovaca",
  "Eslovena", "Etíope", "Fiyiana", "Filipina", "Finlandesa",
  "Gabonesa", "Gambiana", "Georgiana", "Ghanesa", "Griega",
  "Guatemalteca", "Guineana", "Guyanesa", "Haitiana",
  "Hondureña", "Húngara", "India", "Indonesia", "Iraní", "Iraquí",
  "Irlandesa", "Islandesa", "Israelí", "Italiana", "Jamaicana",
  "Japonesa", "Jordana", "Kazaja", "Keniana", "Kirguisa", "Kuwaití",
  "Laosiana", "Letona", "Libanesa", "Liberiana", "Libia", "Liechtensteinesa",
  "Lituana", "Luxemburguesa", "Macedonia", "Malgache", "Malasia",
  "Malaui", "Maldiva", "Maliense", "Maltesa", "Mauritana", "Mauriciana",
  "Moldava", "Monegasca", "Mongola", "Montenegrina", "Mozambiqueña",
  "Namibia", "Nepalesa", "Nicaragüense", "Nigeriana", "Nigerina",
  "Noruega", "Neozelandesa", "Omaní", "Pakistaní", "Palestina",
  "Panameña", "Paraguaya", "Polaca", "Portuguesa", "Puertorriqueña",
  "Rumana", "Rusa", "Ruandesa", "Samoana", "Saudi",
  "Senegalesa", "Serbia", "Singapurense", "Siria", "Somalí",
  "Sri Lankesa", "Sudafricana", "Sudanesa", "Sueca", "Suiza",
  "Surinamesa", "Tailandesa", "Tanzana", "Tayika", "Togolesa",
  "Trinitense", "Tunecina", "Turca", "Turkmenistana",
  "Ucraniana", "Ugandesa", "Uruguaya", "Uzbeka",
  "Venezolana", "Vietnamita", "Yemení", "Zambiana", "Zimbabuense",
  "Otra",
];

const B = {
  navy: "#0D1B3E", navyMid: "#152650", navyLight: "#1E3566",
  sand: "#C8B99A", sky: "#8ECAE6", success: "#22c55e",
  danger: "#ef4444", warning: "#E8A020",
};
const IS = {
  width: "100%", padding: "12px 14px", borderRadius: 9,
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};
const LS = {
  fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
};

const UPGRADES = [
  { key: "piscina",    emoji: "🏊", label: "Área Piscina",   sub: "VIP PASS",   desc: "Acceso exclusivo al área de piscina con servicio personalizado." },
  { key: "botellas",  emoji: "🍾", label: "Botellas",        sub: "Promo",      desc: "Paquete de botellas con mezclas a bordo y en destino." },
  { key: "masajes",   emoji: "💆", label: "Masajes",         sub: "Relajación", desc: "Masajes profesionales disponibles durante el recorrido." },
  { key: "actividades", emoji: "🏄", label: "Actividades",  sub: "Diversión",  desc: "Deportes acuáticos, snorkel y más actividades en Tierra Bomba." },
];

// ── Pantalla: Gracias + menú post check-in ──────────────────────────────────
function PostCheckin({ reserva, salida, paxCount, rid }) {
  const [vista,          setVista]          = useState("menu"); // menu | alergias | upgrade | upgrade_item
  const [upgradeItem,    setUpgradeItem]    = useState(null);
  const [alergiaTexto,   setAlergiaTexto]   = useState(reserva.alergias || "");
  const [alergiaSaving,  setAlergiaSaving]  = useState(false);
  const [alergiaDone,    setAlergiaDone]    = useState(false);
  const [upgradeSending, setUpgradeSending] = useState(false);
  const [upgradeDone,    setUpgradeDone]    = useState(false);

  const horaDisplay = salida?.hora
    ? salida.hora.slice(0, 5)  // "08:30"
    : null;

  const saveAlergia = async () => {
    if (!alergiaTexto.trim()) return;
    setAlergiaSaving(true);
    await supabase.from("reservas").update({ alergias: alergiaTexto.trim() }).eq("id", rid);
    setAlergiaSaving(false);
    setAlergiaDone(true);
  };

  const sendUpgrade = async (item) => {
    setUpgradeSending(true);
    const prev = reserva.extras_solicitados || [];
    const next = [...prev, { tipo: item.key, label: item.label, solicitado_at: new Date().toISOString() }];
    await supabase.from("reservas").update({ extras_solicitados: next }).eq("id", rid);
    setUpgradeSending(false);
    setUpgradeDone(true);
  };

  const Wrap = ({ children }) => (
    <div style={{ minHeight: "100vh", background: B.navy, fontFamily: "'Inter','Segoe UI',sans-serif", padding: "28px 16px 48px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <img src="/atolon-logo-white.png" alt="Atolon" style={{ height: 34, display: "block", margin: "0 auto 24px", objectFit: "contain" }}
          onError={e => { e.target.style.display = "none"; }} />
        {children}
      </div>
    </div>
  );

  /* ── MENÚ PRINCIPAL ── */
  if (vista === "menu") return (
    <Wrap>
      {/* Cabecera */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🌴</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
          ¡Gracias, {reserva.nombre.split(" ")[0]}!
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
          Tus datos están registrados.<br />
          {paxCount > 1 ? `${paxCount} pasajeros` : "1 pasajero"} confirmado{paxCount > 1 ? "s" : ""}.
        </div>

        {/* Hora de salida */}
        {horaDisplay && (
          <div style={{ marginTop: 18, display: "inline-block", background: B.navyMid, borderRadius: 16, padding: "14px 28px", border: `1px solid ${B.sky}33` }}>
            <div style={{ fontSize: 11, color: B.sky, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>SALIDA PROGRAMADA</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", fontFamily: "'Barlow Condensed','Barlow',sans-serif" }}>
              {horaDisplay}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Muelle de La Bodeguita</div>
          </div>
        )}
      </div>

      {/* Botones del menú */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Alergias */}
        <button
          onClick={() => setVista("alergias")}
          style={{
            display: "flex", alignItems: "center", gap: 16,
            background: B.navyMid, borderRadius: 16, padding: "18px 20px",
            border: `1px solid ${B.warning}33`, cursor: "pointer", textAlign: "left", width: "100%",
          }}>
          <div style={{ fontSize: 32, flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Alergias</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
              {reserva.alergias ? "✓ Ya registradas — toca para editar" : "Indica si alguien en el grupo tiene alergias o condiciones médicas"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 18 }}>›</div>
        </button>

        {/* Upgrades */}
        <button
          onClick={() => setVista("upgrade")}
          style={{
            display: "flex", alignItems: "center", gap: 16,
            background: B.navyMid, borderRadius: 16, padding: "18px 20px",
            border: `1px solid ${B.sand}33`, cursor: "pointer", textAlign: "left", width: "100%",
          }}>
          <div style={{ fontSize: 32, flexShrink: 0 }}>⬆️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Upgrade</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
              Mejora tu experiencia: piscina VIP, botellas, masajes y actividades
            </div>
          </div>
          <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 18 }}>›</div>
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 28, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
        Atolon Beach Club · Cartagena, Colombia
      </div>
    </Wrap>
  );

  /* ── ALERGIAS ── */
  if (vista === "alergias") return (
    <Wrap>
      <button onClick={() => setVista("menu")}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        ‹ Volver
      </button>

      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>⚠️ Alergias</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>
        ¿Alguien en tu grupo tiene alergias, condiciones médicas o restricciones alimenticias que debamos saber?
      </div>

      {alergiaDone ? (
        <div style={{ background: B.success + "22", border: `1px solid ${B.success}44`, borderRadius: 14, padding: "20px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: B.success }}>Registrado</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>El personal ya está al tanto.</div>
          <button onClick={() => { setAlergiaDone(false); setVista("menu"); }}
            style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, background: B.navyLight, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>
            Volver al menú
          </button>
        </div>
      ) : (
        <>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px" }}>
            <label style={LS}>Describe las alergias o condiciones</label>
            <textarea
              value={alergiaTexto}
              onChange={e => setAlergiaTexto(e.target.value)}
              placeholder="Ej: Alicia tiene alergia a los mariscos. Juan es diabético."
              rows={4}
              style={{ ...IS, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
          <button
            onClick={saveAlergia}
            disabled={alergiaSaving || !alergiaTexto.trim()}
            style={{
              marginTop: 16, width: "100%", padding: "15px", borderRadius: 12,
              background: !alergiaTexto.trim() ? B.navyLight : B.warning,
              color: !alergiaTexto.trim() ? "rgba(255,255,255,0.3)" : B.navy,
              border: "none", fontWeight: 800, fontSize: 15, cursor: !alergiaTexto.trim() ? "default" : "pointer",
            }}>
            {alergiaSaving ? "Guardando..." : "Registrar alergias"}
          </button>
        </>
      )}
    </Wrap>
  );

  /* ── UPGRADE — sub-menú ── */
  if (vista === "upgrade") return (
    <Wrap>
      <button onClick={() => setVista("menu")}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        ‹ Volver
      </button>

      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>⬆️ Upgrade</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>
        Mejora tu experiencia. El staff te contactará en el muelle para coordinar.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {UPGRADES.map(item => {
          const yaSolicitado = (reserva.extras_solicitados || []).some(s => s.tipo === item.key);
          return (
            <button
              key={item.key}
              onClick={() => { setUpgradeItem(item); setUpgradeDone(false); setVista("upgrade_item"); }}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                background: yaSolicitado ? B.success + "18" : B.navyMid,
                borderRadius: 14, padding: "16px 18px",
                border: `1px solid ${yaSolicitado ? B.success + "55" : B.navyLight}`,
                cursor: "pointer", textAlign: "left", width: "100%",
              }}>
              <div style={{ fontSize: 30, flexShrink: 0 }}>{item.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: yaSolicitado ? B.success : "#fff" }}>
                  {item.label}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: yaSolicitado ? B.success + "aa" : "rgba(255,255,255,0.35)", background: yaSolicitado ? B.success + "22" : B.navyLight, borderRadius: 6, padding: "1px 7px" }}>
                    {yaSolicitado ? "✓ Solicitado" : item.sub}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18, flexShrink: 0 }}>›</div>
            </button>
          );
        })}
      </div>
    </Wrap>
  );

  /* ── UPGRADE — detalle del item ── */
  if (vista === "upgrade_item" && upgradeItem) return (
    <Wrap>
      <button onClick={() => { setVista("upgrade"); setUpgradeDone(false); }}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        ‹ Volver
      </button>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>{upgradeItem.emoji}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{upgradeItem.label}</div>
        <div style={{ display: "inline-block", background: B.navyMid, borderRadius: 20, padding: "3px 14px", fontSize: 12, color: B.sand, marginBottom: 12 }}>
          {upgradeItem.sub}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
          {upgradeItem.desc}
        </div>
      </div>

      {upgradeDone ? (
        <div style={{ background: B.success + "22", border: `1px solid ${B.success}44`, borderRadius: 14, padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: B.success, marginBottom: 6 }}>¡Solicitud enviada!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            El staff te buscará en el muelle para coordinar tu {upgradeItem.label.toLowerCase()}.
          </div>
          <button onClick={() => setVista("upgrade")}
            style={{ marginTop: 18, padding: "11px 28px", borderRadius: 10, background: B.navyLight, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>
            Ver más opciones
          </button>
        </div>
      ) : (
        <button
          onClick={() => sendUpgrade(upgradeItem)}
          disabled={upgradeSending}
          style={{
            width: "100%", padding: "16px", borderRadius: 12,
            background: upgradeSending ? B.navyLight : B.sand,
            color: upgradeSending ? "rgba(255,255,255,0.3)" : B.navy,
            border: "none", fontWeight: 800, fontSize: 16,
            cursor: upgradeSending ? "default" : "pointer",
          }}>
          {upgradeSending ? "Enviando..." : `Solicitar ${upgradeItem.label} →`}
        </button>
      )}
    </Wrap>
  );

  return null;
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function SelfCheckIn() {
  const rid = new URLSearchParams(window.location.search).get("rid");
  const [reserva,  setReserva]  = useState(null);
  const [salida,   setSalida]   = useState(null);
  const [pax,      setPax]      = useState([]);
  const [telefono, setTelefono] = useState("");
  const [email,    setEmail]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState("");

  const faltaTel      = !reserva?.telefono?.trim();
  const faltaEmail    = !reserva?.email?.trim() && !(reserva?.contacto?.trim().includes("@"));
  const pedirContacto = faltaTel || faltaEmail;

  useEffect(() => {
    if (!rid) { setLoading(false); return; }
    supabase.from("reservas")
      .select("id,nombre,pax,pax_a,pax_n,pasajeros,fecha,salida_id,telefono,email,contacto,alergias,extras_solicitados")
      .eq("id", rid).single()
      .then(async ({ data, error: e }) => {
        if (e || !data) { setError("not_found"); setLoading(false); return; }
        setReserva(data);
        const total = (data.pax_a || 0) + (data.pax_n || 0) || data.pax || 1;
        const init = data.pasajeros?.length > 0
          ? [...data.pasajeros]
          : Array.from({ length: total }, (_, i) => ({
              nombre: i === 0 ? (data.nombre || "") : "",
              identificacion: "",
              nacionalidad: "Colombiana",
            }));
        setPax(init);
        // Fetch salida para obtener la hora
        if (data.salida_id) {
          const { data: sal } = await supabase.from("salidas").select("id,nombre,hora").eq("id", data.salida_id).single();
          if (sal) setSalida(sal);
        }
        setLoading(false);
      });
  }, [rid]);

  const set = (i, k, v) => setPax(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const save = async () => {
    const missing = pax.some(p => !p.nombre?.trim() || !p.identificacion?.trim());
    if (missing) { setError("Por favor completa el nombre e identificación de todos los pasajeros."); return; }
    if (pedirContacto) {
      if (faltaTel  && !telefono.trim()) { setError("Por favor ingresa tu número de teléfono."); return; }
      if (faltaEmail && !email.trim())   { setError("Por favor ingresa tu correo electrónico."); return; }
    }
    setSaving(true); setError("");
    const upd = { pasajeros: pax };
    if (faltaTel  && telefono.trim()) upd.telefono = telefono.trim();
    if (faltaEmail && email.trim())   { upd.email = email.trim(); upd.contacto = email.trim(); }
    const { error: e } = await supabase.from("reservas").update(upd).eq("id", rid);
    if (e) { setError("Error al guardar. Intenta de nuevo."); setSaving(false); return; }
    setSaving(false);
    setDone(true);
  };

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>Cargando...</div>
    </div>
  );

  /* ── Not found ── */
  if (!rid || error === "not_found") return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 56 }}>⚓</div>
      <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Enlace no válido</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", maxWidth: 300 }}>
        Este enlace de check-in no existe o ya expiró. Pídele al personal del muelle un nuevo código.
      </div>
    </div>
  );

  /* ── Post check-in (gracias + menú) ── */
  if (done) return (
    <PostCheckin reserva={reserva} salida={salida} paxCount={pax.length} rid={rid} />
  );

  /* ── Formulario ── */
  return (
    <div style={{ minHeight: "100vh", background: B.navy, fontFamily: "'Inter','Segoe UI',sans-serif", padding: "28px 16px 40px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club"
            style={{ height: 42, marginBottom: 14, objectFit: "contain" }}
            onError={e => { e.target.style.display = "none"; }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
            Check-in de Pasajeros
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            {reserva.nombre}
          </div>
          <div style={{ display: "inline-block", marginTop: 8, background: B.navyMid, borderRadius: 20, padding: "4px 16px", fontSize: 12, color: B.sand }}>
            {pax.length} pasajero{pax.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Pasajeros */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pax.map((p, i) => (
            <div key={i} style={{ background: B.navyMid, borderRadius: 16, padding: "20px 18px" }}>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Pasajero {i + 1}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={LS}>Nombre completo</label>
                  <input value={p.nombre} onChange={e => set(i, "nombre", e.target.value)}
                    style={IS} placeholder="Nombre y apellido" autoComplete="name" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LS}>No. Identificación</label>
                    <input value={p.identificacion} onChange={e => set(i, "identificacion", e.target.value)}
                      style={IS} placeholder="CC / Pasaporte" inputMode="text" />
                  </div>
                  <div>
                    <label style={LS}>Nacionalidad</label>
                    <select value={p.nacionalidad} onChange={e => set(i, "nacionalidad", e.target.value)} style={IS}>
                      {NACS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contacto — solo si falta */}
        {pedirContacto && (
          <div style={{ background: B.navyMid, borderRadius: 16, padding: "20px 18px", marginTop: 16 }}>
            <div style={{ fontSize: 12, color: B.sky, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              📞 Datos de contacto
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16, lineHeight: 1.5 }}>
              Necesitamos estos datos para enviarte información de tu reserva.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {faltaTel && (
                <div>
                  <label style={LS}>Teléfono / WhatsApp</label>
                  <input value={telefono} onChange={e => setTelefono(e.target.value)}
                    style={IS} placeholder="+57 300 000 0000" inputMode="tel" type="tel" autoComplete="tel" />
                </div>
              )}
              {faltaEmail && (
                <div>
                  <label style={LS}>Correo electrónico</label>
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    style={IS} placeholder="tucorreo@ejemplo.com" inputMode="email" type="email" autoComplete="email" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && error !== "not_found" && (
          <div style={{ marginTop: 14, background: "#ef444422", border: "1px solid #ef444444", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#f87171" }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button onClick={save} disabled={saving} style={{
          marginTop: 22, width: "100%", padding: "16px", borderRadius: 12,
          background: saving ? B.navyLight : B.sand,
          color: saving ? "rgba(255,255,255,0.3)" : B.navy,
          border: "none", fontWeight: 800, fontSize: 16,
          cursor: saving ? "default" : "pointer", transition: "background 0.2s",
        }}>
          {saving ? "Enviando..." : "Enviar mis datos ✓"}
        </button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          Atolon Beach Club · Cartagena, Colombia
        </div>
      </div>
    </div>
  );
}
