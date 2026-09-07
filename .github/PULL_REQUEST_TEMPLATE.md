<!-- Reemplaza los bloques {…} con la información real -->

## Qué hace este PR

{2–3 líneas describiendo el cambio en lenguaje de usuario. No en lenguaje técnico.}

## Por qué

{La motivación de negocio. Qué problema resuelve. Qué reportó el usuario.}

## Cambios técnicos

- {archivo o módulo tocado: qué cambió}
- {otro cambio: qué cambió}

## Migraciones de base de datos

- [ ] Ninguna
- [ ] Sí, incluida en `supabase/migrations/YYYYMMDD_…sql` (Eric la aplica antes de mergear)

## Cómo probarlo

Pasos concretos para replicar. Ejemplo:

1. Ir a Reservas → Mañana.
2. Click en el grupo BEACH DAY CATAMARÁN.
3. Verificar que el conteo de pax es 36, no 1.

**Preview URL** (auto-generado por Vercel):
`https://atolon-os-git-{rama}-xtravelgroup.vercel.app`

## Screenshots (obligatorio si tocaste UI)

{Arrastra imágenes aquí. Antes / después si aplica.}

## Checklist

- [ ] `npm run build` compila sin errores.
- [ ] Probado en el preview URL con datos reales.
- [ ] Responsive verificado (mobile + desktop) si es UI.
- [ ] No introduje colores hex literales — todo desde `B` en `brand.js`.
- [ ] Uso `logAccion(...)` en las acciones que mutan datos.
- [ ] Si toqué la BD, la migración es idempotente (`IF NOT EXISTS`).
- [ ] No hay credenciales ni tokens en el diff.

## Nota adicional para Eric

{Cualquier decisión de arquitectura que valga la pena discutir, o cosas que
dejé pendientes para siguiente iteración.}
