// ── Carrito de requisición ───────────────────────────────────────────────────
// Persistido en localStorage bajo key "atolon-req-cart".
// Estructura: [{ item_id, nombre, unidad, categoria, cant, precioU }]
// Emite evento "atolon-req-cart:update" cuando cambia → listeners actualizan UI.

const KEY = "atolon-req-cart";
const EVT = "atolon-req-cart:update";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

function write(arr) {
  localStorage.setItem(KEY, JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent(EVT, { detail: { items: arr } }));
}

export function getCart() { return read(); }

export function addToCart(entry) {
  const cart = read();
  const existing = cart.find(c => c.item_id === entry.item_id);
  if (existing) {
    existing.cant = (Number(existing.cant) || 0) + (Number(entry.cant) || 1);
  } else {
    cart.push({ ...entry, cant: Number(entry.cant) || 1 });
  }
  write(cart);
  return cart;
}

export function removeFromCart(item_id) {
  write(read().filter(c => c.item_id !== item_id));
}

export function updateQty(item_id, cant) {
  const cart = read();
  const it = cart.find(c => c.item_id === item_id);
  if (it) { it.cant = Number(cant) || 0; write(cart); }
}

export function clearCart() { write([]); }

export function onCartChange(callback) {
  const handler = (e) => callback(e.detail?.items || read());
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
