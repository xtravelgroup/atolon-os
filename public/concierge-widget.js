// Atolón Concierge Widget — script embebible para sitios web externos
// Uso:
//   <script src="https://www.atolon.co/concierge-widget.js" data-tenant="T-ATOLON"></script>
(function () {
  const script = document.currentScript;
  const TENANT = script?.getAttribute("data-tenant") || "T-ATOLON";
  const API   = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/concierge-turn";
  const ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";
  const COLOR = script?.getAttribute("data-color") || "#38bdf8";
  const NOMBRE = script?.getAttribute("data-nombre") || "Sofía";

  const sessionId = "WEB-" + Math.random().toString(36).slice(2, 12);
  const history = [];

  // Estilos
  const css = document.createElement("style");
  css.textContent = `
    .atc-fab { position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; border-radius: 50%; background: ${COLOR}; color: #fff; border: none; box-shadow: 0 4px 20px rgba(0,0,0,0.3); cursor: pointer; font-size: 28px; z-index: 99998; display: flex; align-items: center; justify-content: center; }
    .atc-panel { position: fixed; bottom: 90px; right: 20px; width: 360px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px); background: #fff; border-radius: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.25); display: none; flex-direction: column; overflow: hidden; z-index: 99999; font-family: system-ui, -apple-system, sans-serif; }
    .atc-panel.open { display: flex; }
    .atc-head { background: ${COLOR}; color: #fff; padding: 14px 16px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
    .atc-body { flex: 1; overflow-y: auto; padding: 12px; background: #f7f9fb; display: flex; flex-direction: column; gap: 8px; }
    .atc-msg { max-width: 82%; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; }
    .atc-msg.u { align-self: flex-end; background: ${COLOR}; color: #fff; }
    .atc-msg.a { align-self: flex-start; background: #fff; color: #222; border: 1px solid #e5e7eb; }
    .atc-input { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #e5e7eb; background: #fff; }
    .atc-input input { flex: 1; padding: 8px 12px; border-radius: 20px; border: 1px solid #d1d5db; font-size: 14px; outline: none; }
    .atc-input button { background: ${COLOR}; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: 700; }
    .atc-hint { text-align: center; color: #6b7280; font-size: 12px; padding: 8px; }
  `;
  document.head.appendChild(css);

  // DOM
  const fab = document.createElement("button");
  fab.className = "atc-fab"; fab.innerHTML = "💬";
  const panel = document.createElement("div");
  panel.className = "atc-panel";
  panel.innerHTML = `
    <div class="atc-head">
      <span>🌴 ${NOMBRE} · Atolón</span>
      <span style="cursor:pointer;font-size:20px" class="atc-close">×</span>
    </div>
    <div class="atc-body" id="atc-body">
      <div class="atc-hint">Hola, soy ${NOMBRE} de Atolón Beach Club. ¿En qué te puedo ayudar? 🌴</div>
    </div>
    <div class="atc-input">
      <input placeholder="Escribe tu mensaje..." id="atc-inp" />
      <button id="atc-send">➤</button>
    </div>
  `;
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const body = panel.querySelector("#atc-body");
  const inp  = panel.querySelector("#atc-inp");
  const btn  = panel.querySelector("#atc-send");
  const close= panel.querySelector(".atc-close");

  fab.onclick = () => panel.classList.toggle("open");
  close.onclick = () => panel.classList.remove("open");

  const addMsg = (rol, txt) => {
    const el = document.createElement("div");
    el.className = "atc-msg " + (rol === "user" ? "u" : "a");
    el.textContent = txt;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  };

  const send = async () => {
    const q = inp.value.trim(); if (!q) return;
    addMsg("user", q); inp.value = ""; btn.disabled = true;
    history.push({ rol: "user", contenido: q });
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json", "apikey": ANON, "Authorization": `Bearer ${ANON}` },
        body: JSON.stringify({ tenant_id: TENANT, session_id: sessionId, playground: true, message: q, history: history.slice(0, -1) }),
      });
      const data = await res.json();
      const reply = data?.reply || "Disculpa, tuvimos un problema. ¿Puedes intentar de nuevo?";
      addMsg("assistant", reply);
      history.push({ rol: "assistant", contenido: reply });
    } catch (e) {
      addMsg("assistant", "⚠️ Sin conexión. Intenta de nuevo.");
    } finally { btn.disabled = false; }
  };

  btn.onclick = send;
  inp.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
})();
