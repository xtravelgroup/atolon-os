# Atolón Beach Club — Partner API

**Versión:** v1
**Base URL:** `https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api`
**Formato:** JSON sobre HTTPS
**Zona horaria:** `America/Bogota` (UTC-5)
**Moneda:** COP (Pesos Colombianos)

API REST para que partners (OTAs, agencias, integradores) consulten disponibilidad, creen reservas y consulten su estado en Atolón Beach Club, Cartagena de Indias.

---

## 1. Autenticación

### Cómo obtener una API Key

1. Atolón genera tu key desde el **API Portal interno**. La key se entrega **una sola vez** al crearla — guárdala de forma segura.
2. Formato de la key: `sk_atolon_` + 32 caracteres hexadecimales (ej: `sk_atolon_4a8f9b2c3d4e5f6a7b8c9d0e1f2a3b4c`).
3. Si se pierde, se debe revocar e invocar una nueva — no hay forma de recuperarla.

### Cómo usarla

Incluye en cada petición el header:

```
Authorization: Bearer sk_atolon_tu_key_aqui
```

### Errores de auth

| Status | Código | Causa |
|--------|--------|-------|
| 401 | `UNAUTHORIZED` | Header ausente o key inválida |
| 403 | `KEY_REVOKED` | Key revocada o expirada |
| 403 | `PARTNER_INACTIVE` | Partner suspendido |
| 429 | `RATE_LIMIT` | Excediste 60 req/min |

### Rate limiting

**60 requests por minuto** por cada API key. Si excedes, recibes 429 hasta que pase el minuto.

---

## 2. Formato de respuestas

### Éxito

```json
{
  "ok": true,
  "...": "campos del recurso"
}
```

HTTP status: `200` (GET, PATCH), `201` (POST create), `204` (DELETE).

### Error

```json
{
  "ok": false,
  "errorCode": "VALIDATION",
  "errorMessage": "Parámetro 'fecha' requerido (YYYY-MM-DD)"
}
```

### Códigos de error comunes

| Código | Descripción |
|---|---|
| `UNAUTHORIZED` | Falta o es inválida la API key |
| `VALIDATION` | Parámetros inválidos o faltantes |
| `NOT_FOUND` | Recurso no existe |
| `NO_AVAILABILITY` | Sin disponibilidad o capacidad |
| `RATE_LIMIT` | Demasiadas peticiones |
| `INTERNAL_ERROR` | Error del servidor (500) |

---

## 3. Endpoints

### 3.1 Health check

```
GET /
```

No requiere autenticación. Verifica que el servicio está arriba.

**Response 200:**
```json
{
  "service": "partners-api",
  "version": "v1",
  "status": "ok"
}
```

---

### 3.2 Listar pasadías (experiencias disponibles)

```
GET /v1/pasadias
```

Devuelve el catálogo de pasadías que ofrecemos. El `nombre` es lo que usarás en `tipo` al crear una reserva.

**Response 200:**
```json
{
  "ok": true,
  "pasadias": [
    {
      "id": "PAS-001",
      "nombre": "VIP Pass",
      "precio": 320000,
      "precio_nino": 200000,
      "min_pax": 1,
      "duracion": "8 horas",
      "descripcion": "Acceso a playa privada, bebida de bienvenida, cama balinesa, almuerzo incluido.",
      "moneda": "COP"
    },
    {
      "id": "PAS-002",
      "nombre": "Exclusive Pass",
      "precio": 590000,
      "precio_nino": 350000,
      "min_pax": 2,
      "duracion": "8 horas",
      "descripcion": "VIP Pass + zona exclusiva + cóctel premium.",
      "moneda": "COP"
    }
  ]
}
```

**Curl:**
```bash
curl https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api/v1/pasadias \
  -H "Authorization: Bearer sk_atolon_tu_key"
```

---

### 3.3 Consultar disponibilidad

```
GET /v1/availability?fecha=YYYY-MM-DD&tipo=<NombrePasadia>
```

**Query params:**

| Nombre | Tipo | Requerido | Descripción |
|---|---|---|---|
| `fecha` | string | sí | Formato `YYYY-MM-DD` (zona Bogotá) |
| `tipo` | string | no | Nombre exacto de la pasadía (ej: `VIP Pass`). Si lo omites, no devuelve precio. |

**Response 200 (con disponibilidad):**
```json
{
  "ok": true,
  "fecha": "2026-05-15",
  "tipo": "VIP Pass",
  "precio_adulto": 320000,
  "precio_nino": 200000,
  "min_pax": 1,
  "salidas": [
    { "salida_id": "S1", "hora": "08:30", "capacidad": 30, "ocupados": 18, "vacantes": 12 },
    { "salida_id": "S2", "hora": "10:00", "capacidad": 30, "ocupados": 25, "vacantes": 5  },
    { "salida_id": "S3", "hora": "11:30", "capacidad": 25, "ocupados": 25, "vacantes": 0  }
  ]
}
```

**Response 200 (día cerrado / sin servicio):**
```json
{
  "ok": true,
  "fecha": "2026-06-01",
  "tipo": "VIP Pass",
  "cerrado": true,
  "salidas": []
}
```

> **Nota:** las razones de cierre (evento privado, buy-out, mantenimiento) no se exponen. El partner solo ve `cerrado: true`.

**Curl:**
```bash
curl "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api/v1/availability?fecha=2026-05-15&tipo=VIP%20Pass" \
  -H "Authorization: Bearer sk_atolon_tu_key"
```

---

### 3.4 Crear reserva

```
POST /v1/reservas
Content-Type: application/json
```

**Body:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `fecha` | string | sí | `YYYY-MM-DD` |
| `tipo` | string | sí | Nombre exacto de la pasadía |
| `salida_id` | string | sí* | ID de salida (ej: `S1`) |
| `hora` | string | sí* | Alternativa a `salida_id` (ej: `08:30`) |
| `nombre` | string | sí | Nombre del titular |
| `contacto` | string | no | Email o teléfono del titular |
| `pax_a` | integer | sí | Adultos (`pax_a + pax_n ≥ 1`) |
| `pax_n` | integer | no | Niños (0–11 años) |
| `edades_ninos` | int[] | no | Edad de cada niño (para validación de tarifas) |

*Se requiere **uno** de `salida_id` o `hora`.

**Response 201:**
```json
{
  "ok": true,
  "id": "API-1776999999999-AB3D",
  "estado": "confirmado",
  "fecha": "2026-05-15",
  "salida_id": "S1",
  "hora": "08:30",
  "tipo": "VIP Pass",
  "pax_a": 2,
  "pax_n": 1,
  "total": 840000,
  "moneda": "COP"
}
```

**Errores posibles:**

| Status | Código | Motivo |
|---|---|---|
| 400 | `VALIDATION` | Falta un campo o formato inválido |
| 400 | `NO_AVAILABILITY` | Salida no existe para ese día |
| 409 | `NO_AVAILABILITY` | No hay vacantes suficientes |

**Curl:**
```bash
curl -X POST https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api/v1/reservas \
  -H "Authorization: Bearer sk_atolon_tu_key" \
  -H "Content-Type: application/json" \
  -d '{
    "fecha":       "2026-05-15",
    "tipo":        "VIP Pass",
    "salida_id":   "S1",
    "nombre":      "Valentina Ospina",
    "contacto":    "valentina@example.com",
    "pax_a":       2,
    "pax_n":       1,
    "edades_ninos":[8]
  }'
```

> **💡 Buenas prácticas:**
> - Consulta `/v1/availability` **justo antes** de crear la reserva — la disponibilidad puede cambiar entre consultas.
> - Si recibes 409 (`NO_AVAILABILITY`), reintenta con otra salida o fecha.
> - Guarda el `id` que te devolvemos — es la referencia única de la reserva en nuestro sistema.

---

### 3.5 Consultar reserva

```
GET /v1/reservas/:id
```

**Response 200:**
```json
{
  "ok": true,
  "reserva": {
    "id":        "API-1776999999999-AB3D",
    "fecha":     "2026-05-15",
    "salida_id": "S1",
    "tipo":      "VIP Pass",
    "nombre":    "Valentina Ospina",
    "contacto":  "valentina@example.com",
    "pax":       3,
    "pax_a":     2,
    "pax_n":     1,
    "total":     840000,
    "abono":     840000,
    "saldo":     0,
    "estado":    "confirmado",
    "ep":        "pagado",
    "source":    "api",
    "notas":     "Partner: PTR-001"
  }
}
```

**Estados posibles** (`estado`):

| Valor | Significado |
|---|---|
| `confirmado` | Reserva activa |
| `pendiente` | Creada pero pendiente de pago/confirmación |
| `cancelado` | Cancelada (no aparece en operación) |
| `check_in` | Ya hizo check-in el día del servicio |

**Curl:**
```bash
curl https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api/v1/reservas/API-1776999999999-AB3D \
  -H "Authorization: Bearer sk_atolon_tu_key"
```

---

### 3.6 Cancelar reserva

```
POST /v1/reservas/:id/cancel
```

No requiere body. Cancela la reserva (es idempotente: si ya está cancelada, responde 200 sin error).

**Response 200:**
```json
{
  "ok": true,
  "id": "API-1776999999999-AB3D",
  "estado": "cancelado"
}
```

> **Política de cancelación:** la API permite cancelar cualquier reserva del partner hasta **24 horas antes del servicio**. Cancelaciones posteriores se procesan como "no show" y pueden tener cargo según el contrato comercial.

**Curl:**
```bash
curl -X POST https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api/v1/reservas/API-1776999999999-AB3D/cancel \
  -H "Authorization: Bearer sk_atolon_tu_key"
```

---

## 4. Webhooks (opcional)

Puedes registrar URLs para recibir notificaciones cuando cambian reservas.

### Eventos soportados

| Evento | Cuándo dispara |
|---|---|
| `reserva.created` | Se creó una reserva (puede venir de tu canal u otro) |
| `reserva.cancelled` | Una reserva se canceló |
| `disponibilidad.updated` | Cambio significativo de disponibilidad (evento privado, buy-out) |

### Formato del webhook (cuando Atolón te llama)

**Headers:**
```
Content-Type: application/json
X-Atolon-Signature: hmac-sha256-of-body-hex
X-Atolon-Event: reserva.created
```

**Body:**
```json
{
  "event": "reserva.created",
  "timestamp": "2026-05-15T08:30:00-05:00",
  "data": {
    "id": "API-1776999999999-AB3D",
    "fecha": "2026-05-15",
    "tipo": "VIP Pass",
    "pax": 3,
    "total": 840000
  }
}
```

### Cómo verificar la firma

Al registrar el webhook recibes un `secret`. Para verificar que el evento viene de nosotros:

```js
// Node.js
const crypto = require("crypto");
const expected = crypto.createHmac("sha256", webhookSecret)
  .update(rawBody).digest("hex");
if (expected !== req.headers["x-atolon-signature"]) {
  return res.status(401).send("Invalid signature");
}
```

```python
# Python
import hmac, hashlib
expected = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
if expected != request.headers["X-Atolon-Signature"]:
    abort(401)
```

> **Nota:** El endpoint debe devolver `2xx` en menos de 5 segundos. Si falla, reintentamos con backoff exponencial hasta 5 veces.

---

## 5. Ejemplos end-to-end

### Flujo típico: cotización + reserva

```bash
# 1. Obtener catálogo
curl https://.../v1/pasadias -H "Authorization: Bearer $KEY"

# 2. Consultar disponibilidad
curl "https://.../v1/availability?fecha=2026-05-15&tipo=VIP%20Pass" \
  -H "Authorization: Bearer $KEY"

# 3. Crear reserva (2 adultos + 1 niño)
curl -X POST https://.../v1/reservas \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"fecha":"2026-05-15","tipo":"VIP Pass","hora":"08:30","nombre":"Juan Pérez","pax_a":2,"pax_n":1,"edades_ninos":[8]}'

# 4. Consultar estado después
curl https://.../v1/reservas/API-1776... -H "Authorization: Bearer $KEY"
```

### Ejemplo en JavaScript/Node

```js
const API_BASE = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api";
const API_KEY  = "sk_atolon_tu_key";

async function atolonFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type":  "application/json",
      ...(options.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`${json.errorCode || res.status}: ${json.errorMessage || "API error"}`);
  }
  return json;
}

// Crear reserva
async function crearReserva(datos) {
  return atolonFetch("/v1/reservas", {
    method: "POST",
    body:   JSON.stringify(datos),
  });
}

const reserva = await crearReserva({
  fecha: "2026-05-15",
  tipo:  "VIP Pass",
  hora:  "08:30",
  nombre: "Valentina Ospina",
  contacto: "valentina@example.com",
  pax_a: 2,
  pax_n: 1,
  edades_ninos: [8],
});
console.log("Reserva creada:", reserva.id);
```

### Ejemplo en Python

```python
import requests

API_BASE = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/partners-api"
API_KEY  = "sk_atolon_tu_key"

def atolon(method, path, **kwargs):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    r = requests.request(method, f"{API_BASE}{path}", headers=headers, **kwargs)
    data = r.json()
    if not data.get("ok"):
        raise Exception(f"{data.get('errorCode')}: {data.get('errorMessage')}")
    return data

# Disponibilidad
disp = atolon("GET", "/v1/availability", params={"fecha": "2026-05-15", "tipo": "VIP Pass"})
print("Vacantes por salida:", disp["salidas"])

# Crear reserva
r = atolon("POST", "/v1/reservas", json={
    "fecha": "2026-05-15",
    "tipo":  "VIP Pass",
    "hora":  "08:30",
    "nombre": "Juan Pérez",
    "pax_a": 2,
    "pax_n": 0,
})
print("Reserva:", r["id"])
```

---

## 6. Soporte

- **Email técnico:** api@atoloncartagena.com
- **Slack / WhatsApp:** solicítalo al equipo comercial
- **SLA:** 99.5% uptime. Reportes y breakdowns se notifican por email con 24h de antelación cuando sea planeado.

## 7. Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-04 | Release inicial: `/pasadias`, `/availability`, `/reservas` CRUD, webhooks |

---

© Atolón Beach Club · Cartagena de Indias, Colombia
