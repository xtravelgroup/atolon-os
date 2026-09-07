# Guía para contribuir a Atolón OS

Bienvenido al proyecto. Este documento describe **cómo trabajar en Atolón OS
sin romper producción**. Si vas a hacer tu primer cambio, léelo entero. Toma
15 minutos.

Antes de empezar también deberías leer:
- **[CLAUDE.md](CLAUDE.md)** — reglas mandatorias de estilo y responsive.
- **[README.md](README.md)** — descripción del proyecto y setup local.

---

## 1. Setup local (una sola vez)

```bash
# Clonar
git clone git@github.com:xtravelgroup/atolon-os.git
cd atolon-os

# Instalar dependencias
npm install

# Configurar env
cp .env.example .env.local
# Pídele a Eric las llaves reales de VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

# Correr en local
npm run dev            # http://localhost:5173

# Verificar que compila
npm run build
```

Necesitas Node 20+. Si vas a correr scripts SQL (`node supabase/run-sql.mjs`)
también vas a necesitar el password de la BD — pídeselo a Eric.

---

## 2. Flujo de trabajo (obligatorio)

**Dos ambientes, dos ramas protegidas:**

- **`main`** → ambiente de **staging**. URL fijo generado por Vercel al
  que Eric prueba antes de aprobar. Todos los PRs de features apuntan aquí.
- **`production`** → ambiente de **producción** (`www.atolon.co/login`). Solo se
  actualiza cuando Eric hace un merge explícito desde `main`.

**Nadie hace push directo a ninguna de las dos ramas.** Cero excepciones.

**Diagrama:**

```
tu rama (feat/algo)
    ↓  PR + preview URL efímero
main  ← staging  (Eric prueba aquí)
    ↓  PR de promoción (solo Eric lo mergea)
production  ← producción (www.atolon.co/login)
```

Un cambio típico atraviesa dos revisiones: primero el PR del feature (que
Eric aprueba y mergea a `main`), después el PR de promoción `main → production`
que Eric arma cuando decide que ya está listo para clientes reales.

### 2.1 Crear tu rama

```bash
# Actualizar main
git checkout main
git pull

# Crear rama para tu cambio
git checkout -b feat/nombre-corto-descriptivo
```

**Convención de nombres de rama:**
- `feat/…` — nueva feature (ej. `feat/reservas-tab-hoy`)
- `fix/…` — corrección de bug (ej. `fix/pago-doble-cobro`)
- `chore/…` — mantenimiento (ej. `chore/actualizar-deps`)
- `docs/…` — solo documentación
- `revert/…` — revertir un cambio

### 2.2 Hacer commits

Un commit por unidad lógica. Mensaje claro, en español, con prefijo:

```bash
git commit -m "fix(Pagos): retención se guardaba en 0 al editar comision

El input de retención no re-leía el valor persistido tras cerrar
el modal. Se corrige leyendo pago.comision.pago_retencion en el
useState inicial. Antes reportaba \$0 aunque hubiera retención."
```

Estructura del mensaje:
```
tipo(modulo): resumen corto de una línea

Explicación de la causa raíz (no solo qué hiciste).
Impacto en el usuario / negocio.
Fix aplicado.
```

**Nunca** commits genéricos como `wip`, `cambios`, `update`, `fix bug`.

### 2.3 Subir tu rama

```bash
git push origin feat/nombre-corto-descriptivo
```

Vercel te va a mandar automáticamente un URL de preview:
`https://atolon-os-git-feat-nombre-corto-descriptivo-xtravelgroup.vercel.app`

Ese URL es una copia funcional del app con TUS cambios sin tocar producción.
Pruébalo antes de abrir el PR.

### 2.4 Abrir el Pull Request

Desde GitHub → **Compare & pull request**. El template ya viene precargado.
Rellénalo:

- **Qué hace este PR** — 2–3 líneas.
- **Por qué** — la motivación de negocio.
- **Cómo probarlo** — pasos concretos para que Eric replique.
- **Screenshots** — obligatorios si tocaste UI.
- **Migraciones incluidas** — mencionar el archivo SQL si aplica.

Asigna a **Eric Kern** como reviewer.

### 2.5 Iteración

Si Eric pide cambios, los aplicas en la misma rama:

```bash
# aplicar cambios
git add -A
git commit -m "fix(Pagos): aclarar mensaje de error cuando la retención excede"
git push origin feat/nombre-corto-descriptivo
```

El PR se actualiza solo y Vercel regenera el preview.

### 2.6 Merge a staging

**Eric mergea, no tú.** Cuando aprueba, hace *"Squash and merge"* de tu PR
a `main` — tus commits se convierten en uno solo con el título del PR.
Después puedes borrar tu rama.

En cuanto se hace el merge, Vercel despliega automáticamente el URL de
staging con tu cambio. Eric prueba ahí en vivo con datos reales.

### 2.7 Promoción a producción (solo Eric)

Cuando Eric decide que un lote de cambios en `main` está listo para
clientes, arma un PR de promoción:

```bash
# En su máquina
git checkout production
git pull
git merge main --ff-only
git push origin production
```

O directamente desde GitHub, abriendo un PR de `main → production` y
mergeando *"Merge commit"* (no squash — queremos preservar los commits
individuales para trazabilidad de releases).

Al mergear a `production`, Vercel despliega inmediatamente a `www.atolon.co/login`.
**Este paso siempre lo hace Eric, nunca el programador.**

---

## 3. Cambios de base de datos (schema)

Si tu PR necesita agregar/modificar tablas o columnas:

1. **Crea un archivo de migración** en `supabase/migrations/` con el patrón:

   ```
   YYYYMMDD_descripcion_corta.sql
   ```

   Ejemplo: `20260907_pagos_otros_retencion.sql`

2. **La migración debe ser idempotente**. Nunca `CREATE TABLE foo` — usa:

   ```sql
   CREATE TABLE IF NOT EXISTS foo (...);
   ALTER TABLE foo ADD COLUMN IF NOT EXISTS ...;
   ```

3. **No corras la migración tú.** Menciónala en la descripción del PR. Eric
   la aplica manualmente con `node supabase/run-sql.mjs` antes de mergear.

4. **Nunca** hagas UPDATE/DELETE masivos sobre datos de producción sin
   avisar a Eric primero. Un SQL destructivo mal calibrado no tiene deshacer.

---

## 4. Cosas que NUNCA debes hacer

- ❌ `git push --force` a `main` ni a `production` (ni a ninguna rama compartida).
- ❌ Push directo a `main` ni a `production` (ambas están protegidas y van a rebotar).
- ❌ Abrir PR directamente a `production` — todos los PRs son a `main`.
     Solo Eric arma el PR de promoción `main → production`.
- ❌ Commit con `--no-verify` para saltarse hooks.
- ❌ Correr `DELETE FROM …` o `TRUNCATE` en producción sin avisar.
- ❌ Cambiar tokens hardcodeados de brand (`B.navy`, `B.sand`, etc.) por
     colores hex literales.
- ❌ Introducir Tailwind, styled-components, CSS Modules o cualquier otro
     sistema de estilos. **Solo JSX inline con `B`.**
- ❌ Guardar credenciales, API keys o passwords en el código.
- ❌ Consumir APIs externas de pago sin verificar firma (Wompi/Zoho).

---

## 5. Cosas que debes hacer siempre

- ✅ Leer y respetar `CLAUDE.md` — sistema de responsive obligatorio.
- ✅ Usar `logAccion(...)` fire-and-forget en toda acción del usuario que
     mute datos.
- ✅ Prefijos semánticos de IDs (`R-{ts}`, `PAG-{ts}`, `EVT-{ts}`, etc.).
- ✅ Todas las fechas en zona `America/Bogota`, nunca UTC del navegador.
- ✅ Validar inputs antes de escribir a BD (`if (!x || x <= 0) return ...`).
- ✅ Guardar contra doble-click en botones de acción (`if (saving) return`).
- ✅ Probar en el preview URL antes de pedir review.

---

## 6. Estructura del proyecto

```
atolon-os/
├── src/
│   ├── App.jsx                # Router principal
│   ├── modules/               # 130+ módulos JSX (Reservas, Hotel, RH, etc.)
│   ├── components/            # Componentes compartidos entre módulos
│   ├── lib/                   # Utilidades: supabase, responsive, trm, logAccion
│   └── brand.js               # Design tokens (B.navy, B.sand, ...)
├── supabase/
│   ├── migrations/            # 300+ archivos SQL versionados
│   ├── functions/             # 68 edge functions Deno/TypeScript
│   └── run-sql.mjs            # Utilidad para aplicar SQL
├── CLAUDE.md                  # Reglas mandatorias
├── CONTRIBUTING.md            # Este archivo
└── README.md
```

Cada módulo grande es **un solo archivo `.jsx` autocontenido** con toda su
lógica, sub-componentes y modales inline. `Reservas.jsx` tiene ~5.000 líneas
y `EventoDetalle.jsx` ~6.000. Es intencional: navegar el dominio es abrir un
solo archivo. Cuando un modal supere las 300 líneas, extrae a un archivo hijo
en `src/modules/hotel/` o similar.

---

## 7. Cuándo pedir ayuda

- **Duda de negocio** (cómo debería funcionar una feature): Eric.
- **Duda de arquitectura** (dónde poner algo, cómo relacionar tablas): Eric.
- **Bug reproducible en local**: crea un issue en GitHub con pasos.
- **Bug urgente en producción**: WhatsApp directo a Eric + mensaje "urgente".

No hay pregunta tonta. Preguntar 5 minutos ahorra 5 horas de refactor.

---

## 8. Onboarding checklist (primer día)

- [ ] Clonar el repo y correr `npm run dev` con éxito.
- [ ] Leer `CLAUDE.md` de principio a fin.
- [ ] Leer las reglas de esta guía.
- [ ] Abrir la app local y navegar 3–4 módulos (Reservas, Hotel, Pagos).
- [ ] Correr `node supabase/run-sql.mjs "SELECT 1;"` con éxito.
- [ ] Hacer un PR trivial (por ejemplo, mejorar un texto en la UI) para
      practicar el flujo entero.

Bienvenido al equipo.
