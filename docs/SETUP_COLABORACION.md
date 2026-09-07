# Setup de colaboración — instrucciones para Eric

Este documento contiene los **3 pasos manuales** que solo Eric puede hacer
en GitHub para dejar el sandbox listo para el nuevo programador. Los
archivos de gobernanza (CONTRIBUTING, CODEOWNERS, PR template, CI) ya están
en el repo.

---

## Paso 1 · Añadir al programador como colaborador (2 min)

1. Ir a: https://github.com/xtravelgroup/atolon-os/settings/access
2. Click en **Add people**.
3. Buscar por username o email del programador.
4. Rol: **Write** (NO Admin, NO Maintain).
5. Enviar invitación. Cuando la acepte, ya puede clonar y crear ramas.

**Por qué Write y no Admin**: puede push a ramas y abrir PRs, pero
no puede cambiar reglas del repo, ni borrar `main`, ni forzar push.

---

## Paso 2 · Proteger la rama `main` (5 min)

1. Ir a: https://github.com/xtravelgroup/atolon-os/settings/branches
2. Click **Add branch ruleset** (o **Add rule** en interfaz vieja).
3. Nombre: `main`.
4. Target: **Include default branch** o especificar `main`.
5. Activar estas casillas:

   - ✅ **Require a pull request before merging**
     - ✅ Require approvals: `1`
     - ✅ Dismiss stale pull request approvals when new commits are pushed
     - ✅ Require review from Code Owners (usa `.github/CODEOWNERS`)
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - En la lista de checks agrega: **`build`** (aparece después del primer PR)
   - ✅ **Require conversation resolution before merging**
   - ✅ **Restrict pushes that create matching refs**
   - ❌ Allow force pushes (deshabilitado)
   - ❌ Allow deletions (deshabilitado)
   - ✅ **Do not allow bypassing the above settings** — para que ni siquiera
     tú puedas hacer push directo por accidente (opcional pero recomendado).

6. Click **Create** / **Save**.

**Resultado**: `main` queda blindada. Cualquier push directo falla. Los
PRs necesitan tu aprobación (por CODEOWNERS) + que pase el `build` de CI.

---

## Paso 2.5 · Ambiente separado staging vs producción (5 min)

**Objetivo**: que los cambios del programador nunca lleguen directo a
`www.atolon.co/login`. En su lugar caen en un ambiente de staging donde
Eric los prueba, y solo entonces (con aprobación explícita) van a producción.

**Cómo queda el flujo:**

```
Programador → rama feat/algo → PR a main
                                  ↓ Eric mergea (staging)
                                main = staging (preview URL fijo)
                                  ↓ Eric prueba en staging
                                  ↓ Eric arma PR main → production
                                  ↓ Eric mergea (única forma de tocar prod)
                                production = www.atolon.co/login
```

### 2.5.1 En Vercel

1. Ir a: https://vercel.com/dashboard → proyecto `atolon-os` → **Settings → Git**.
2. En **Production Branch**, cambiar de `main` a **`production`**.
3. Guardar. Vercel confirmará: los merges a `main` ya no despliegan a
   producción, solo generan previews estables.
4. Sigue en **Settings → Environment Variables**: verifica que todas las
   variables tengan el checkbox **Production** activo — esas se aplican
   a la rama `production`. **Preview** cubre `main` y ramas de feature.

### 2.5.2 En GitHub — proteger `production`

Repite lo del Paso 2 pero para la rama `production`, con reglas **más
estrictas**:

1. Ir a: https://github.com/xtravelgroup/atolon-os/settings/branches
2. **Add branch ruleset** → nombre: `production`.
3. Activar:
   - ✅ Require a pull request before merging (approvals: **1** — el tuyo)
   - ✅ Require review from Code Owners
   - ✅ Require status checks to pass (`build`)
   - ✅ Require branches to be up to date before merging
   - ✅ Restrict who can push (solo tú)
   - ❌ Force pushes deshabilitado
   - ❌ Deletions deshabilitado
4. Guardar.

### 2.5.3 Verificación

- URL de staging: `https://atolon-os-git-main-xtravelgroup.vercel.app`
  (Vercel te muestra el URL exacto en el dashboard tras el próximo push a main).
- URL de producción: `https://www.atolon.co/login` (no cambia, sigue apuntando
  a `production`).

Después de esto, el flujo del programador es idéntico a lo que ya sabe
(PR a `main`), pero producción queda bajo tu control absoluto.

---

## Paso 3 · Configurar Vercel para previews (1 min)

Vercel ya te da previews automáticos por cada rama sin configurar nada.
Solo verifica que estén activos:

1. Ir a: https://vercel.com/dashboard → proyecto `atolon-os`.
2. Settings → **Git**.
3. Confirmar:
   - ✅ **Automatic deployments** habilitado.
   - ✅ **Preview Deployments** para todas las ramas (default).
4. Settings → **Environment Variables** — asegurarte de que las de
   Preview tienen los mismos valores que Production (o unos separados si
   quieres apuntar a un Supabase de dev).

**Cómo el programador recibe su preview URL**:
- Después de `git push origin feat/algo`, GitHub le muestra un check
  con URL directa al preview.
- También llega al PR como comentario automático de Vercel.

---

## Opcional · Segundo Supabase para desarrollo (30 min)

Si el programador va a tocar migraciones agresivas o mucha data, monta
un Supabase separado para dev.

1. https://supabase.com/dashboard → **New project** → `atolon-os-dev` (plan gratis).
2. Correr las migraciones existentes contra el proyecto dev:
   ```bash
   for f in supabase/migrations/*.sql; do
     PGURL=<url-dev> node supabase/run-sql.mjs "$f"
   done
   ```
   (te toca ajustar `run-sql.mjs` para que reciba la URL por env var).
3. Restaurar un dump reducido de producción (anonimiza emails/teléfonos):
   ```sql
   -- ejemplo: anonimizar clientes
   UPDATE reservas SET email = 'test' || id || '@dev.local',
                        telefono = '+57' || (RANDOM()*10000000)::int;
   ```
4. En Vercel, crear un environment adicional `preview-dev` con las
   variables del proyecto dev. El programador le apunta con su rama.

Esta capa la agregas cuando el flujo básico ya esté funcionando.

---

## Checklist final antes de invitar al programador

- [ ] Paso 1: colaborador Write invitado y aceptó.
- [ ] Paso 2: rama `main` protegida con las reglas de arriba.
- [ ] Paso 3: Vercel previews confirmados como activos.
- [ ] Mandarle 3 links:
  - README.md
  - CONTRIBUTING.md
  - CLAUDE.md
- [ ] Compartir credenciales de `.env.local` por canal seguro (1Password,
      Bitwarden, o mensaje efímero — nunca por email).
- [ ] Sesión de 30 min de walkthrough en vivo por videollamada:
      recorrido de módulos, dónde está la data, cómo hacer un PR de prueba.

Con esto, listo. El programador ya puede trabajar de forma segura y tú
solo revisas PRs.
