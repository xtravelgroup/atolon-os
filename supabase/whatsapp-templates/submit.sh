#!/bin/bash
# Sube todas las templates JSON de este directorio al WABA configurado.
# Uso:
#   META_TOKEN="EAAxxx..." WABA_ID="604162649435767" ./submit.sh
#   o:
#   ./submit.sh template1.json template2.json
#
# Lee credenciales (orden de prioridad):
#   1. Variables de entorno META_TOKEN + WABA_ID
#   2. configuracion.meta_whatsapp_token + meta_whatsapp_waba_id en Supabase

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# Cargar credenciales de BD si no están en env
if [ -z "$META_TOKEN" ] || [ -z "$WABA_ID" ]; then
  echo "Cargando credenciales de configuracion (BD)..."
  cd "$(dirname "$DIR")/.." && cd .  # asegurar cwd
  CREDS=$(node "$(dirname "$DIR")/../supabase/run-sql-tx.mjs" "SELECT meta_whatsapp_token, meta_whatsapp_waba_id FROM configuracion WHERE id = 'atolon'" 2>/dev/null)
  META_TOKEN="${META_TOKEN:-$(echo "$CREDS" | grep -oE '"meta_whatsapp_token": *"[^"]+"' | cut -d'"' -f4)}"
  WABA_ID="${WABA_ID:-$(echo "$CREDS" | grep -oE '"meta_whatsapp_waba_id": *"[^"]+"' | cut -d'"' -f4)}"
fi

if [ -z "$META_TOKEN" ] || [ -z "$WABA_ID" ]; then
  echo "❌ Faltan META_TOKEN o WABA_ID"
  exit 1
fi

# Archivos a subir
if [ $# -gt 0 ]; then
  FILES="$@"
else
  FILES="$DIR"/*.json
fi

for f in $FILES; do
  [ -f "$f" ] || continue
  NAME=$(basename "$f" .json)
  echo ""
  echo "▶ Subiendo: $NAME"
  RES=$(curl -sS -X POST "https://graph.facebook.com/v19.0/$WABA_ID/message_templates" \
    -H "Authorization: Bearer $META_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$f")
  echo "$RES" | python3 -m json.tool 2>/dev/null || echo "$RES"
done
