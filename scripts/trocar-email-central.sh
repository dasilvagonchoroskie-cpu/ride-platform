#!/usr/bin/env bash
# Troca o e-mail de entrada da conta do dono da Central (Evandro, 11/11/2026:
# perdeu o acesso ao Gmail antigo; a conta da plataforma passa a ser outra).
# Entra com o e-mail atual (segredo ADMIN_EMAIL), muda para NOVO_EMAIL e
# confere que o login com o e-mail novo funciona. Nunca mostra codigo.
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
CHAVE="${OTP_CHAVE_TESTE:-}"
post() { curl -s -m 120 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
patch() { curl -s -m 120 -X PATCH "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get() { curl -s -m 120 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
entrar() {
  local C L
  C=$(post /auth/otp/request "{\"email\":\"$1\",\"purpose\":\"LOGIN\"}" | jq -r '.data.debugCode // empty')
  L=$(post /auth/otp/verify "{\"email\":\"$1\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
  echo "$L" | jq -r '.data.accessToken // empty'
}
curl -s -m 180 "$API/health" >/dev/null || true # acorda o servidor
NOVO=$(echo "$NOVO_EMAIL" | tr 'A-Z' 'a-z' | tr -d ' ')
TA=$(entrar "$ADMIN_EMAIL")
if [ -z "$TA" ]; then
  # Ja trocado antes? Confere com o e-mail novo.
  TN=$(entrar "$NOVO")
  [ -n "$TN" ] && [ "$(get /auth/me "$TN" | jq -r '.data.role')" = ADMIN ] && { echo "OK: a Central ja entra com o e-mail novo."; exit 0; }
  echo "FALHA: nao entrei com o e-mail atual da Central."; exit 1
fi
ME=$(get /auth/me "$TA")
ID=$(echo "$ME" | jq -r '.data.id'); [ "$(echo "$ME" | jq -r '.data.role')" = ADMIN ] || { echo "FALHA: a conta nao e da Central."; exit 1; }
X=$(patch "/admin/dados/pessoas/$ID" "{\"email\":\"$NOVO\"}" "$TA")
echo "$X" | jq -e '.success == true' >/dev/null || { echo "FALHA ao trocar: $(echo "$X" | jq -c '.error // .' | head -c 300)"; exit 1; }
echo "OK: e-mail da Central trocado."
TN=$(entrar "$NOVO")
[ -n "$TN" ] && [ "$(get /auth/me "$TN" | jq -r '.data.role')" = ADMIN ] && echo "OK: entrar na Central com o e-mail novo funciona (o codigo vai para a caixa nova)." || { echo "FALHA: login com o e-mail novo"; exit 1; }
