# Atolón Print Agent

Puente HTTP → ESC/POS para impresoras térmicas (Digital POS DIG-E2001 y compatibles) usado por AtolonOS.

El navegador no puede hablar directo con impresoras en LAN. Este agente corre en una PC de la red local, recibe trabajos vía HTTP desde `atolon.co` (o `localhost`) y los envía a la impresora por TCP en el puerto 9100 (ESC/POS raw).

## Requisitos
- Node.js 18+ (o usar el `.exe` empaquetado)
- Impresora DIG-E2001 conectada por Ethernet con IP fija en la LAN

## Instalación rápida (desarrollo)
```bash
cd print-agent
npm install
npm start
```

El agente queda escuchando en `http://0.0.0.0:9100` (acepta conexiones de `localhost` y del resto de la LAN).

## Configurar la impresora

Edita la IP con un `POST /config`:

```bash
curl -X POST http://localhost:9100/config \
  -H "Content-Type: application/json" \
  -d '{"printerIp":"192.168.1.50","printerPort":9100}'
```

O abre Atolón → Configuración → Impresora y rellena el formulario (botón "Guardar y probar").

La config queda guardada en `~/.atolon-print-agent/config.json`.

## Endpoints

### `GET /status`
Devuelve estado del agente y si la impresora responde.

```json
{
  "ok": true,
  "agent": "atolon-print-agent",
  "version": "1.0.0",
  "printer": { "ip": "192.168.1.50", "port": 9100, "reachable": true }
}
```

### `POST /print`
```json
{
  "type": "recibo_pos",
  "data": {
    "numero": "0001",
    "mesero": "Camilo",
    "mesa": "B-12",
    "items": [
      { "nombre": "Cerveza Águila", "cantidad": 2, "precio": 12000 },
      { "nombre": "Hamburguesa de res", "cantidad": 1, "precio": 38000 }
    ],
    "subtotal": 62000,
    "propina": 6200,
    "total": 68200,
    "pago_metodo": "efectivo",
    "pago_recibido": 70000,
    "cambio": 1800
  }
}
```

Tipos soportados: `recibo_pos`, `test`.

### `POST /config`
Actualiza configuración (impresora IP, puerto, datos empresa, orígenes permitidos CORS).

## Compilar binario standalone

```bash
npm run build:win    # → dist/atolon-print-agent.exe
npm run build:mac    # → dist/atolon-print-agent-mac
npm run build:linux  # → dist/atolon-print-agent-linux
```

El .exe no requiere Node.js instalado en la PC destino.

## Auto-arranque en Windows

1. Compila `npm run build:win`
2. Copia `dist/atolon-print-agent.exe` a `C:\Atolon\`
3. Crea acceso directo y mételo a `Win+R → shell:startup`
4. Listo: arranca con la sesión del usuario

## Seguridad

- CORS solo permite `atolon.co`, `localhost` y `127.0.0.1` por defecto
- Editable via `POST /config` con `allowedOrigins: ["..."]`
- El agente escucha en `0.0.0.0` para permitir uso desde tablets/móviles en la misma LAN. Si solo quieres uso local, lanzá con `BIND_HOST=127.0.0.1 npm start`.

## Troubleshooting

- **"Impresora no responde"** → verifica que la DIG-E2001 tenga IP fija, que ping responda, y que el puerto 9100 esté abierto (es el default en estas térmicas).
- **CORS error en navegador** → agrega tu dominio a `allowedOrigins` con `POST /config`.
- **Caracteres raros (tildes, ñ)** → ya se usa `PC850_MULTILINGUAL`. Si la impresora tiene otro charset, edita `server.js` línea con `characterSet`.
