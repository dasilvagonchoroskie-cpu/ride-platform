#!/usr/bin/env bash
# Ajustes de operacao feitos pelas rotas da Central (como o dono faria no
# app), sem mexer direto no banco. Uso pela esteira "Ajustes da Central".
#   COBRANCA=TAXIMETRO|FECHADO  -> Central > Tarifas > Como cobrar a corrida
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
REL="${REL:-/tmp/ajustes-central.txt}"
: > "$REL"
CHAVE="${OTP_CHAVE_TESTE:-}"
post() { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
put()  { curl -s -m 90 -X PUT "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()  { curl -s -m 90 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
diz()  { echo "$1" | tee -a "$REL"; }

diz "Ajustes da Central - $(date -u '+%d/%m/%Y %H:%M UTC')"
P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
L=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ -n "$TA" ] || { diz "FALHA: login da Central"; exit 1; }

if [ -n "${COBRANCA:-}" ]; then
  ANTES=$(get /admin/tariffs "$TA" | jq -r '.data.cobranca')
  X=$(put /admin/tariffs/cobranca "{\"modo\":\"$COBRANCA\"}" "$TA")
  DEPOIS=$(get /admin/tariffs "$TA" | jq -r '.data.cobranca')
  [ "$DEPOIS" = "$COBRANCA" ] && diz "OK: cobranca da corrida $ANTES -> $DEPOIS" || { diz "FALHA: cobranca ($X)"; exit 1; }
fi
diz "Pronto."
