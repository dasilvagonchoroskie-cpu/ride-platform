#!/usr/bin/env bash
# Deixa pronta (ou repoe) a CONTA DE TESTE do motorista no servidor real:
# cadastro completo, veiculo, aprovacao presencial da Central e carteira com
# R$ 100,00. Pode rodar quantas vezes quiser: so completa o que faltar.
#
# Entrar no app do motorista com o telefone (64) 90000-0001; o codigo aparece
# na tela enquanto o servidor estiver em modo de teste.
# APAGAR antes de operar de verdade (lista de pendencias do arquivo mestre).
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
REL="${REL:-/tmp/conta-teste.txt}"
: > "$REL"
CHAVE="${OTP_CHAVE_TESTE:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@ride.local}"
TELEFONE="+5564900000001"
SALDO_ALVO=10000
post()  { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
patch() { curl -s -m 90 -X PATCH "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()   { curl -s -m 90 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
diz()   { echo "$1" | tee -a "$REL"; }
erro()  { diz "ERRO  $1"; diz "      resposta: $(echo "$2" | head -c 400)"; exit 1; }

diz "Conta de teste do motorista - $(date -u '+%d/%m/%Y %H:%M UTC')"
get /health >/dev/null   # acorda o servidor gratuito

P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
TA=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}" | jq -r '.data.accessToken // empty')
[ -n "$TA" ] || erro "login da Central" "$P"

P=$(post /auth/otp/request "{\"phone\":\"$TELEFONE\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
V=$(post /auth/otp/verify "{\"phone\":\"$TELEFONE\",\"code\":\"$C\",\"purpose\":\"LOGIN\",\"role\":\"DRIVER\",\"device\":{\"deviceId\":\"conta-teste\",\"platform\":\"ANDROID\"}}")
TM=$(echo "$V" | jq -r '.data.accessToken // empty')
[ -n "$TM" ] || erro "login do motorista de teste" "$P $V"
post /auth/accept-terms '{"version":"1.0.0"}' "$TM" >/dev/null
diz "OK    login do telefone (64) 90000-0001"

X=$(get /drivers/me "$TM")
DID=$(echo "$X" | jq -r '.data.id // .data.driver.id // empty')
if [ -z "$DID" ]; then
  X=$(post /drivers/onboarding '{"name":"Motorista de Teste","cpf":"52998224725","birthDate":"1985-03-10","cnhNumber":"12345678900","cnhCategory":"B","cnhExpiresAt":"2035-12-31"}' "$TM")
  DID=$(echo "$X" | jq -r '.data.id // .data.driver.id // empty')
  [ -n "$DID" ] || erro "cadastro do motorista" "$X"
  diz "OK    cadastro criado (CPF 529.982.247-25, CNH 12345678900 categoria B, validade 31/12/2035)"
else
  diz "OK    cadastro ja existia"
fi

X=$(get /vehicles/me "$TM")
LISTA='(.data | if type=="array" then . else (.items // []) end)'
if [ "$(echo "$X" | jq -r "$LISTA | length")" = "0" ]; then
  X=$(post /vehicles '{"plate":"FMV0T01","brand":"Chevrolet","model":"Spin","year":2020,"color":"Prata"}' "$TM")
  echo "$X" | jq -e '.success == true' >/dev/null || erro "cadastro do veiculo" "$X"
  diz "OK    veiculo criado (Chevrolet Spin 2020 prata, placa FMV0T01)"
else
  diz "OK    veiculo ja existia: $(echo "$X" | jq -r "$LISTA | .[0] | \"\\(.brand) \\(.model) \\(.plate)\"")"
fi

X=$(get "/admin/drivers/$DID" "$TA")
if [ "$(echo "$X" | jq -r '.data.status')" != "APPROVED" ]; then
  X=$(patch "/admin/drivers/$DID/review" '{"status":"APPROVED","presentialCheck":true,"reason":"Conta de teste da Fortaleza Mov (conferencia presencial dispensada)."}' "$TA")
  echo "$X" | jq -e '.success == true' >/dev/null || erro "aprovacao da Central" "$X"
  diz "OK    aprovado pela Central"
else
  diz "OK    ja estava aprovado"
fi

SALDO=$(get "/admin/drivers/$DID/wallet" "$TA" | jq -r '.data.balanceCents // 0')
if [ "$SALDO" -lt "$SALDO_ALVO" ]; then
  X=$(post "/admin/drivers/$DID/wallet/credit" "{\"amountCents\":$((SALDO_ALVO - SALDO)),\"operation\":\"CREDIT\",\"description\":\"Saldo da conta de teste\"}" "$TA")
  echo "$X" | jq -e '.success == true' >/dev/null || erro "recarga da carteira" "$X"
  SALDO=$SALDO_ALVO
fi
diz "OK    carteira com R\$ $((SALDO / 100)),$(printf '%02d' $((SALDO % 100)))"
diz ""
diz "Pronto. No app do motorista: telefone (64) 90000-0001, o codigo aparece na tela."
