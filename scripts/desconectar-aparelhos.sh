#!/usr/bin/env bash
# Celular perdido ou vendido (Evandro, 09/11/2026): derruba contas de todos os
# aparelhos pelas rotas da Central (o mesmo botao "Desconectar aparelhos").
#   NOME=texto        -> desconecta as contas (fora as de teste) com esse texto no nome
#   NOME=todas        -> desconecta todas as contas (fora as de teste)
#   CENTRAL=sim       -> desconecta tambem a conta da Central (por ultimo)
# Sem NOME nem CENTRAL so lista quem tem sessao aberta. O relatorio mostra so
# o primeiro nome, o tipo de conta e o modelo do aparelho (repositorio publico).
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
REL="${REL:-/tmp/desconectar-aparelhos.txt}"
: > "$REL"
CHAVE="${OTP_CHAVE_TESTE:-}"
post() { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()  { curl -s -m 90 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
diz()  { echo "$1" | tee -a "$REL"; }

diz "Desconectar aparelhos - $(date -u '+%d/%m/%Y %H:%M UTC')"
P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
L=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ -n "$TA" ] || { diz "FALHA: login da Central ($(echo "$L" | jq -c '.error // .data | keys? // .' | head -c 200))"; exit 1; }
EU=$(get /auth/me "$TA" | jq -r '.data.id')

contas() {
  local pag=1 X
  while :; do
    X=$(get "/admin/users?page=$pag&limit=100" "$TA")
    echo "$X" | jq -c '.data.items[] | select((.metadata.teste // false) != true and .deletedAt == null) | {id, role, name}'
    [ "$pag" -ge "$(echo "$X" | jq -r '.data.meta.totalPages // 1')" ] && break
    pag=$((pag+1))
  done
}

listar() {
  diz ""; diz "$1"
  local n=0
  while read -r u; do
    id=$(echo "$u" | jq -r .id)
    A=$(get "/admin/usuarios/$id/aparelhos" "$TA")
    s=$(echo "$A" | jq '[.data[]? | .sessoesAbertas] | add // 0')
    [ "$s" -gt 0 ] || continue
    n=$((n+1))
    diz "- $(echo "$u" | jq -r '.role + " · " + (.name | split(" ")[0])')$( [ "$id" = "$EU" ] && echo ' (esta Central)') · $s sessao(oes) · $(echo "$A" | jq -r '[.data[] | select(.sessoesAbertas > 0) | ((.model // "aparelho sem nome") + " (visto " + (.lastSeenAt[0:16] | sub("T";" ")) + " UTC)")] | join("; ")')"
  done < <(contas)
  [ "$n" -gt 0 ] || diz "- nenhuma conta com sessao aberta"
  diz "  (contas conferidas: $(contas | wc -l); resposta da lista: $(get "/admin/users?page=1&limit=1" "$TA" | jq -c '{ok: .success, total: .data.meta.total, erro: .error.code}'))"
}

listar "Contas com sessao aberta (antes):"
CORTAR=0
if [ -n "${NOME:-}" ]; then
  diz ""; diz "Desconectando contas com \"$NOME\" no nome:"
  while read -r u; do
    id=$(echo "$u" | jq -r .id); [ "$id" = "$EU" ] && continue
    X=$(post "/admin/usuarios/$id/desconectar" '{}' "$TA")
    diz "- $(echo "$u" | jq -r '.role + " · " + (.name | split(" ")[0])'): $(echo "$X" | jq -r 'if .success then "\(.data.sessoesEncerradas) sessao(oes) encerrada(s)" else "FALHA \(.error.message // .)" end')"
    CORTAR=1
  done < <(contas | jq -c --arg n "$NOME" 'select($n == "todas" or (.name | ascii_downcase | contains($n | ascii_downcase)))')
fi
[ "${CENTRAL:-}" = "sim" ] && listar "Depois (antes de desconectar a Central):" || { [ "$CORTAR" = 1 ] && listar "Contas com sessao aberta (depois):"; }
if [ "${CENTRAL:-}" = "sim" ]; then
  X=$(post "/admin/usuarios/$EU/desconectar" '{}' "$TA")
  diz ""; diz "Central: $(echo "$X" | jq -r 'if .success then "\(.data.sessoesEncerradas) sessao(oes) encerrada(s), inclusive a desta esteira" else "FALHA \(.error.message // .)" end')"
  X=$(get /auth/me "$TA"); echo "$X" | jq -e '.success == true' >/dev/null && diz "FALHA: o acesso da Central continuou valendo" || diz "OK: o acesso antigo da Central caiu na hora"
fi
diz ""; diz "Pronto."
