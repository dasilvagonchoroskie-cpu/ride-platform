#!/usr/bin/env bash
# Teste de ponta a ponta no servidor REAL: Central, passageiro, motorista e
# uma corrida inteira. Cada etapa grava OK ou FALHA com a resposta do servidor.
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
REL="${REL:-/tmp/relatorio.txt}"
: > "$REL"
FALHAS=0
ok()    { echo "OK     $1" | tee -a "$REL"; }
falha() { echo "FALHA  $1" | tee -a "$REL"; echo "       resposta: $(echo "$2" | head -c 400)" | tee -a "$REL"; FALHAS=$((FALHAS+1)); }
post()  { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
patch() { curl -s -m 90 -X PATCH "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()   { curl -s -m 90 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
sucesso() { echo "$1" | jq -e '.success == true' >/dev/null 2>&1; }
entrar() {
  local p c v
  p=$(post /auth/otp/request "{\"phone\":\"$1\",\"purpose\":\"LOGIN\"}")
  c=$(echo "$p" | jq -r '.data.debugCode // empty')
  v=$(post /auth/otp/verify "{\"phone\":\"$1\",\"code\":\"$c\",\"purpose\":\"LOGIN\",\"role\":\"$2\",\"device\":{\"deviceId\":\"teste-automatico\",\"platform\":\"ANDROID\"}}")
  echo "$v" | jq -r '.data.accessToken // empty'
}
echo "Teste de ponta a ponta - $(date -u '+%d/%m/%Y %H:%M UTC')" | tee -a "$REL"; echo | tee -a "$REL"

S=$(get /health); echo "$S" | grep -q '"status":"ok"' && ok "Servidor, banco e Redis no ar" || falha "Servidor, banco e Redis" "$S"

L=$(post /auth/password/login "{\"email\":\"admin@ride.local\",\"password\":\"$ADMIN_SENHA\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ -n "$TA" ] && ok "Central: login real do administrador" || falha "Central: login do administrador" "$L"
for rota in "/admin/drivers?status=PENDING" /admin/rides/active /admin/reports/summary /admin/tariffs; do
  X=$(get "$rota" "$TA"); sucesso "$X" && ok "Central carrega $rota" || falha "Central carrega $rota" "$X"
done

SUF=$(date +%H%M%S)
TP=$(entrar "+55649${SUF}71" PASSENGER)
[ -n "$TP" ] && ok "Passageiro: login pelo codigo de teste" || falha "Passageiro: login" "sem token"
X=$(post /auth/accept-terms '{"version":"1.0.0"}' "$TP"); sucesso "$X" && ok "Passageiro: aceite dos termos gravado" || falha "Passageiro: aceite dos termos" "$X"
EMB='{"latitude":-18.0125,"longitude":-49.3547,"address":"Praca da Matriz, Goiatuba"}'
DES='{"latitude":-18.0050,"longitude":-49.3610,"address":"Rodoviaria de Goiatuba"}'
X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":$DES}" "$TP")
sucesso "$X" && ok "Passageiro: preco da corrida calculado" || falha "Passageiro: preco da corrida" "$X"

TM=$(entrar "+55649${SUF}72" DRIVER)
[ -n "$TM" ] && ok "Motorista: login pelo codigo de teste" || falha "Motorista: login" "sem token"
post /auth/accept-terms '{"version":"1.0.0"}' "$TM" >/dev/null
CPF=$(python3 -c "
import random
n=[random.randint(0,9) for _ in range(9)]
for k in (10,11):
    s=sum(d*(k-i) for i,d in enumerate(n)); r=(s*10)%11; n.append(0 if r==10 else r)
print(''.join(map(str,n)))")
CNH=$(python3 -c "import random;print(''.join(str(random.randint(0,9)) for _ in range(11)))")
X=$(post /drivers/onboarding "{\"cpf\":\"$CPF\",\"birthDate\":\"1990-05-10\",\"cnhNumber\":\"$CNH\",\"cnhCategory\":\"B\",\"cnhExpiresAt\":\"2031-01-01\"}" "$TM")
DID=$(echo "$X" | jq -r '.data.id // .data.driver.id // empty')
sucesso "$X" && ok "Motorista: cadastro (CPF e CNH) aceito" || falha "Motorista: cadastro" "$X"
PLACA="TST$((RANDOM%10))A$(printf '%02d' $((RANDOM%100)))"
X=$(post /vehicles "{\"plate\":\"$PLACA\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2021,\"color\":\"Branco\"}" "$TM")
sucesso "$X" && ok "Motorista: veiculo cadastrado depois do cadastro" || falha "Motorista: veiculo" "$X"

X=$(patch "/admin/drivers/$DID/review" '{"status":"APPROVED","presentialCheck":true,"reason":"Conferencia presencial: teste automatico de ponta a ponta."}' "$TA")
sucesso "$X" && ok "Central: motorista aprovado com conferencia presencial" || falha "Central: aprovar motorista" "$X"
X=$(patch /drivers/me/online '{"isOnline":true}' "$TM"); sucesso "$X" && ok "Motorista: ficou disponivel" || falha "Motorista: ficar disponivel" "$X"
X=$(post /drivers/me/location '{"latitude":-18.0130,"longitude":-49.3550,"accuracy":10}' "$TM"); sucesso "$X" && ok "Motorista: posicao enviada" || falha "Motorista: posicao" "$X"

X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"CASH\"}" "$TP")
RID=$(echo "$X" | jq -r '.data.ride.id // empty')
sucesso "$X" && ok "Passageiro: corrida pedida" || falha "Passageiro: pedir corrida" "$X"
N=0; for t in 1 2 3 4 5; do sleep 3; X=$(get /driver/rides/offers "$TM"); N=$(echo "$X" | jq -r '.data | length' 2>/dev/null); [ "${N:-0}" -ge 1 ] 2>/dev/null && break; done
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Motorista: chamado chegou" || falha "Motorista: chamado chegou" "$X"
for passo in accept arriving arrived start; do
  X=$(post "/driver/rides/$RID/$passo" '{"latitude":-18.0126,"longitude":-49.3548}' "$TM")
  sucesso "$X" && ok "Motorista: $passo" || falha "Motorista: $passo" "$X"
done
X=$(post "/driver/rides/$RID/finish" '{}' "$TM")
sucesso "$X" && ok "Motorista: corrida finalizada, valor $(echo "$X" | jq -r '.data.finalFareCents // "?"') centavos" || falha "Motorista: finalizar" "$X"
VAL=$(echo "$X" | jq -r '.data.finalFareCents // 0')
HORA=$((10#$(TZ=America/Sao_Paulo date +%H)))
TAR=$(get /admin/tariffs "$TA")
if [ "$HORA" -ge 6 ] && [ "$HORA" -lt 22 ]; then BAND=diurna; ESP=$(echo "$TAR" | jq -r '.data.diurna.baseFareCents // .data.DIURNA.baseFareCents // 1000'); else BAND=noturna; ESP=$(echo "$TAR" | jq -r '.data.noturna.baseFareCents // .data.NOTURNA.baseFareCents // 2000'); fi
[ "$VAL" = "$ESP" ] && ok "Bandeira certa pela hora de Brasilia (${HORA}h, $BAND: $VAL centavos)" || falha "Bandeira pela hora de Brasilia (${HORA}h deveria ser $BAND, $ESP centavos; cobrou $VAL)" "$TAR"
X=$(get /admin/reports/summary "$TA"); sucesso "$X" && ok "Central: resumo de hoje com $(echo "$X" | jq -r '.data.ridesToday') corrida(s)" || falha "Central: resumo" "$X"

# ---- Painel do motorista (Atividades, Carteira pre-paga, Corridas) ----
X=$(get "/driver/activity?period=day" "$TM")
if sucesso "$X" && [ "$(echo "$X" | jq -r '.data.rides')" -ge 1 ] 2>/dev/null; then
  ok "Motorista: Atividades de hoje - $(echo "$X" | jq -r '.data.rides') corrida(s), ganho $(echo "$X" | jq -r '.data.earningCents') centavos, online $(echo "$X" | jq -r '.data.onlineSeconds')s"
else falha "Motorista: Atividades de hoje" "$X"; fi
for per in week month; do
  X=$(get "/driver/activity?period=$per" "$TM")
  sucesso "$X" && [ "$(echo "$X" | jq -r '.data.buckets | length')" -ge 7 ] 2>/dev/null \
    && ok "Motorista: grafico $per com $(echo "$X" | jq -r '.data.buckets | length') dias" || falha "Motorista: grafico $per" "$X"
done
X=$(get /driver/wallet "$TM")
COM=$(echo "$X" | jq -r '[.data.transactions[] | select(.type=="COMMISSION")] | length' 2>/dev/null)
GAN=$(echo "$X" | jq -r '[.data.transactions[] | select(.type=="RIDE_EARNING")] | length' 2>/dev/null)
if sucesso "$X" && [ "${COM:-0}" -ge 1 ] && [ "${GAN:-1}" = "0" ]; then
  ok "Motorista: carteira pre-paga so descontou a comissao (saldo $(echo "$X" | jq -r '.data.balanceCents') centavos)"
else falha "Motorista: carteira pre-paga" "$X"; fi
X=$(post "/admin/drivers/$DID/wallet/credit" '{"amountCents":1000,"description":"Recarga via Pix (teste)"}' "$TA")
sucesso "$X" && ok "Central: recarga lancada, saldo agora $(echo "$X" | jq -r '.data.balanceCents') centavos" || falha "Central: lancar recarga" "$X"
X=$(get /admin/settings/central "$TA"); sucesso "$X" && ok "Central: contato de recarga carregado" || falha "Central: contato de recarga" "$X"
X=$(get "/driver/rides/history" "$TM")
[ "$(echo "$X" | jq -r '.data.total' 2>/dev/null)" -ge 1 ] 2>/dev/null && ok "Motorista: historico de corridas com $(echo "$X" | jq -r '.data.total') corrida(s)" || falha "Motorista: historico de corridas" "$X"

patch /drivers/me/online '{"isOnline":false}' "$TM" >/dev/null
post "/rides/$RID/cancel" '{"reason":"Teste automatico"}' "$TP" >/dev/null
patch "/admin/drivers/$DID/review" '{"status":"SUSPENDED","reason":"Conta de teste automatico"}' "$TA" >/dev/null
echo | tee -a "$REL"; echo "Resultado: $FALHAS falha(s)." | tee -a "$REL"
exit $FALHAS
