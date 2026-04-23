#!/bin/bash
# deploy-abandoned-cart.sh
# Despliega las 6 Edge Functions del módulo de Carrito Abandonado
# Uso: bash supabase/deploy-abandoned-cart.sh

PROJECT_REF="ncdyttgxuicyruathkxd"
SUPABASE_CLI="/opt/homebrew/bin/supabase"

# Verificar que supabase CLI existe
if [ ! -f "$SUPABASE_CLI" ]; then
  SUPABASE_CLI=$(which supabase)
fi

if [ -z "$SUPABASE_CLI" ]; then
  echo "❌ supabase CLI no encontrado. Instalar con: brew install supabase/tap/supabase"
  exit 1
fi

echo "🚀 Desplegando Edge Functions del Carrito Abandonado..."
echo "   Proyecto: $PROJECT_REF"
echo ""

FUNCTIONS=(
  "abandoned-cart-detector"
  "abandoned-cart-sender"
  "ac-open-pixel"
  "ac-click-track"
  "ac-recover"
  "ac-unsubscribe"
)

for fn in "${FUNCTIONS[@]}"; do
  echo "📦 Desplegando: $fn ..."
  $SUPABASE_CLI functions deploy "$fn" --project-ref "$PROJECT_REF"
  if [ $? -eq 0 ]; then
    echo "   ✅ $fn — OK"
  else
    echo "   ❌ $fn — ERROR"
  fi
  echo ""
done

echo "✅ Despliegue completado."
echo ""
echo "📋 Próximos pasos:"
echo "   1. Configura los cron jobs en supabase/abandoned-cart-crons.sql"
echo "      (reemplaza {SERVICE_ROLE_KEY} con tu service_role key)"
echo "   2. Asegúrate que RESEND_API_KEY esté en los secretos de la Edge Function"
echo "      (supabase secrets set RESEND_API_KEY=re_xxx --project-ref $PROJECT_REF)"
echo "   3. Verifica que pg_cron y pg_net estén habilitados en tu proyecto"
