# Atolón OS

Sistema operativo del beach club Atolón (Cartagena). Frontend React + Vite,
backend Supabase (PostgreSQL + Auth + Storage + Edge Functions Deno).
Deploy continuo en Vercel — cada push a `main` va a producción en 90s.

- **Producción**: [www.atolon.co/login](https://www.atolon.co/login)
- **Staging**: [atolon-os-git-main-atolon.vercel.app](https://atolon-os-git-main-atolon.vercel.app)
- **Repositorio**: [github.com/xtravelgroup/atolon-os](https://github.com/xtravelgroup/atolon-os)

## Documentación

| Archivo | Para qué |
|---|---|
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Cómo trabajar en el proyecto: flujo de PRs, convenciones, qué está prohibido. **Lectura obligatoria antes de tu primer PR.** |
| **[CLAUDE.md](CLAUDE.md)** | Reglas técnicas mandatorias: sistema de responsive, tokens de diseño, estilo. |
| **[.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)** | Template que se auto-carga al abrir un PR. |
| **[.env.example](.env.example)** | Plantilla de variables de entorno. Copia a `.env.local`. |

## Setup rápido

```bash
git clone git@github.com:xtravelgroup/atolon-os.git
cd atolon-os
npm install
cp .env.example .env.local
# Pide a Eric los valores reales
npm run dev            # dev server en http://localhost:5173
npm run build          # build de producción
```

## Estructura

```
atolon-os/
├── src/
│   ├── App.jsx              # Router principal
│   ├── modules/             # 130+ módulos JSX (uno por dominio)
│   ├── components/          # Componentes compartidos
│   ├── lib/                 # Utilidades (supabase, responsive, trm, ...)
│   └── brand.js             # Design tokens
├── supabase/
│   ├── migrations/          # 300+ archivos SQL versionados
│   ├── functions/           # 68 edge functions Deno/TypeScript
│   └── run-sql.mjs          # CLI para aplicar SQL
└── .github/                 # Templates de PR/issues y CODEOWNERS
```

## Flujo de trabajo

**Nadie hace push directo a `main`.** Todo cambio pasa por un Pull Request:

1. Crea una rama: `git checkout -b feat/algo`
2. Haz commits pequeños y bien descritos.
3. `git push origin feat/algo` — Vercel te da un preview URL.
4. Abre un PR y llena el template.
5. Eric revisa, aprueba y mergea.

Detalles completos en **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Stack

- **Frontend**: React 18 + Vite + JSX inline (sin Tailwind).
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions Deno).
- **Deploy**: Vercel (auto-deploy en cada push a `main`).
- **Integraciones**: Wompi + Zoho Pay + Cloudbeds + Loggro + Meta WhatsApp
  Cloud API + Anthropic Claude.

## Contacto

- **Product Owner / Arquitecto**: Eric Kern
- **Usuaria clave gerencia**: Yamileth
- **Usuaria clave Compras / Pagos**: Andrea
- **Usuaria clave Embarcaciones**: Dailis

Cualquier duda de negocio: preguntar a Eric.
