#!/usr/bin/env bash
# Copia diaria do banco (Evandro, 10/10/2026: "copia de seguranca, gratis").
# Entra como a Central, baixa todas as tabelas (GET /admin/limpeza/exportar),
# confere, compacta e CRIPTOGRAFA com a chave publica (infra/copia-banco.age.pub).
# So abre com a chave privada, que fica com o Evandro (arquivo do projeto).
set -euo pipefail
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
REL="${REL:-/tmp/copia-banco.txt}"
SAIDA="${SAIDA:-copia}"
: > "$REL"
CHAVE="${OTP_CHAVE_TESTE:-}"
post() { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} -d "$2"; }
diz()  { echo "$1" | tee -a "$REL"; }

diz "Copia do banco - $(date -u '+%d/%m/%Y %H:%M UTC')"
P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
L=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ -n "$TA" ] || { diz "FALHA: login da Central"; exit 1; }

mkdir -p "$SAIDA"
NOME="fortaleza-mov-$(date -u '+%Y%m%d-%H%M')"
curl -s -m 300 "$API/admin/limpeza/exportar" -H "Authorization: Bearer $TA" -o "/tmp/$NOME.json"
[ "$(jq -r '.success' "/tmp/$NOME.json")" = "true" ] || { diz "FALHA: exportar ($(head -c 300 "/tmp/$NOME.json"))"; exit 1; }
# Conferencia: as tabelas principais vieram e tem conta de verdade.
for t in users drivers rides wallets settings; do
  N=$(jq -r ".data.contagem.$t // \"falta\"" "/tmp/$NOME.json")
  [ "$N" != "falta" ] || { diz "FALHA: tabela $t nao veio"; exit 1; }
done
diz "Tabelas e linhas:"
jq -r '.data.contagem | to_entries[] | "  \(.key): \(.value)"' "/tmp/$NOME.json" | tee -a "$REL"
jq -c '.data' "/tmp/$NOME.json" | gzip -9 > "/tmp/$NOME.json.gz"
age -r "$(cat infra/copia-banco.age.pub)" -o "$SAIDA/$NOME.json.gz.age" "/tmp/$NOME.json.gz"
rm -f "/tmp/$NOME.json" "/tmp/$NOME.json.gz"
diz "Arquivo: $NOME.json.gz.age ($(du -h "$SAIDA/$NOME.json.gz.age" | cut -f1), criptografado)"
diz "OK"
