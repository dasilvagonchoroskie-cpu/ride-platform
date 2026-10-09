#!/usr/bin/env bash
# Limpeza do banco REAL pela Central (Evandro, 08/10/2026: "esses registros
# de teste tem que eliminar"). Usa as mesmas rotas do botao da Central:
#   listar          -> so mostra o que existe (nada e apagado)
#   zerar_e_limpar  -> copia de seguranca no banco, zera a operacao (corridas,
#                      recargas, saques, SOS, avaliacoes), apaga as contas de
#                      teste e as contas que NAO estao na lista MANTER.
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
ACAO="${ACAO:-listar}"
MANTER="${MANTER:-+5564992686632,+5564996472794,+5554996421415}"
MANTER_EMAILS="${MANTER_EMAILS:-dasilvagonchoroskie@gmail.com}"
CHAVE="${OTP_CHAVE_TESTE:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@ride.local}"
REL="${REL:-/tmp/limpeza.txt}"
: > "$REL"
log() { echo "$1" | tee -a "$REL"; }
post() { curl -s -m 600 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()  { curl -s -m 120 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }

log "Limpeza do banco - $(date -u '+%d/%m/%Y %H:%M UTC') - acao: $ACAO"
for t in 1 2 3; do S=$(get /health); echo "$S" | grep -q '"status":"ok"' && break; sleep 20; done
P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
L=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ -n "$TA" ] || { log "FALHA: login da Central: $L"; exit 1; }

resumo() { get /admin/limpeza "$TA" | jq -c '.data | {contasTeste, contas, corridas, movimentos, saques, sos, avaliacoes, cuponsTeste, ultimaCopia}'; }
log "Antes: $(resumo)"

manter() {
  local tel="$1" email="$2"
  [ "$tel" != "-" ] && [[ ",$MANTER," == *",$tel,"* ]] && return 0
  [ "$email" != "-" ] && [[ ",$MANTER_EMAILS," == *",$email,"* ]] && return 0
  return 1
}

contas() { get /admin/limpeza/contas "$TA" | jq -r '.data.items[] | [.id, (if .phone == "" then "-" else .phone end), (.email // "-"), .name, (.corridas|tostring), (.teste|tostring), (.motorista|tostring)] | @tsv'; }
log ""
log "Contas (passageiros e motoristas):"
while IFS=$'\t' read -r id tel email nome corridas teste motorista; do
  if manter "$tel" "$email"; then m="FICA "; else m="APAGA"; fi
  log "  $m  $nome | ${tel:-sem telefone} | ${email:-sem e-mail} | corridas $corridas | teste $teste | motorista $motorista"
done < <(contas)

if [ "$ACAO" = "zerar_e_limpar" ]; then
  log ""
  X=$(post /admin/limpeza/zerar '{"confirmacao":"ZERAR"}' "$TA")
  log "Zerar a operacao: $(echo "$X" | jq -c '.data // .error')"
  echo "$X" | jq -e '.success == true' >/dev/null || { log "FALHA ao zerar: nada mais foi feito."; exit 1; }
  IDS=()
  while IFS=$'\t' read -r id tel email nome corridas teste motorista; do
    manter "$tel" "$email" || IDS+=("\"$id\"")
  done < <(contas)
  log "Contas para apagar: ${#IDS[@]}"
  for ((i=0; i<${#IDS[@]}; i+=200)); do
    LOTE=$(IFS=,; echo "${IDS[*]:i:200}")
    X=$(post /admin/limpeza/contas/apagar "{\"ids\":[$LOTE]}" "$TA")
    log "  apagadas: $(echo "$X" | jq -c '{contas: .data.contas, recusadas: [.data.recusadas[]? | "\(.nome): \(.motivo)"]}')"
  done
  log ""
  log "Depois: $(resumo)"
  log "Contas que ficaram:"
  while IFS=$'\t' read -r id tel email nome corridas teste motorista; do log "  $nome | ${tel:-sem telefone} | ${email:-sem e-mail}"; done < <(contas)
fi
