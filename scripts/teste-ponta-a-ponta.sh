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
# A chave do teste (segredo do GitHub) faz o servidor devolver o codigo
# na resposta so para esta esteira; ninguem mais recebe codigo assim.
CHAVE="${OTP_CHAVE_TESTE:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@ride.local}"
post()  { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
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

P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
L=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ "$(echo "$L" | jq -r '.data.user.role' 2>/dev/null)" = "ADMIN" ] && ok "Central: login do administrador pelo codigo do e-mail" || falha "Central: login do administrador pelo codigo do e-mail" "$P $L"
for rota in "/admin/drivers?status=PENDING" /admin/rides/active /admin/reports/summary /admin/tariffs; do
  X=$(get "$rota" "$TA"); sucesso "$X" && ok "Central carrega $rota" || falha "Central carrega $rota" "$X"
done

SUF=$(date +%H%M%S)
TP=$(entrar "+55649${SUF}71" PASSENGER)
[ -n "$TP" ] && ok "Passageiro: login pelo codigo de teste" || falha "Passageiro: login" "sem token"
X=$(post /auth/accept-terms '{"version":"1.0.0"}' "$TP"); sucesso "$X" && ok "Passageiro: aceite dos termos gravado" || falha "Passageiro: aceite dos termos" "$X"
# ---- Cadastro do passageiro (igual ao modelo: cidade, nome, e-mail, genero, CPF, senha) ----
X=$(get /app/config)
[ "$(echo "$X" | jq -r '.data.login.email' 2>/dev/null)" = "true" ] && ok "App: entrada por codigo no e-mail disponivel (telefone: $(echo "$X" | jq -r '.data.login.telefone'))" || falha "App: canais de entrada" "$X"
CID=$(echo "$X" | jq -r '.data.cidades[0] // empty' 2>/dev/null)
sucesso "$X" && ok "App: configuracao publica ($(echo "$X" | jq -r '.data.cidades | length') cidade(s), WhatsApp $(echo "$X" | jq -r '.data.whatsapp // "nenhum"'))" || falha "App: configuracao publica" "$X"
X=$(get /admin/operacao "$TA"); sucesso "$X" && ok "Central: cidades e avisos carregados" || falha "Central: cidades e avisos" "$X"
CPFP=$(python3 -c "
import random
n=[random.randint(0,9) for _ in range(9)]
for k in (10,11):
    s=sum(d*(k-i) for i,d in enumerate(n)); r=(s*10)%11; n.append(0 if r==10 else r)
print(''.join(map(str,n)))")
EMAILP="passageiro.${SUF}$((RANDOM%1000))@teste.fortalezamov.com.br"
CORPO="{\"name\":\"Passageiro Teste Automatico\",\"email\":\"$EMAILP\",\"gender\":\"NAO_INFORMAR\",\"cpf\":\"$CPFP\",\"password\":\"Teste1234\"${CID:+,\"city\":\"$CID\"}}"
X=$(post /auth/cadastro "$CORPO" "$TP")
[ "$(echo "$X" | jq -r '.data.cadastroCompleto' 2>/dev/null)" = "true" ] && ok "Passageiro: cadastro completo gravado (cidade: ${CID:-sem lista})" || falha "Passageiro: cadastro completo" "$X"
X=$(post /auth/cadastro "$CORPO" "$TP")
sucesso "$X" && falha "Passageiro: cadastro repetido deveria ser recusado" "$X" || ok "Passageiro: cadastro repetido recusado"
X=$(post /auth/password/login "{\"email\":\"$EMAILP\",\"password\":\"Teste1234\"}")
[ "$(echo "$X" | jq -r '.data.user.role' 2>/dev/null)" = "PASSENGER" ] && ok "Passageiro: entra pelo e-mail e senha" || falha "Passageiro: entrar pelo e-mail" "$X"
P=$(post /auth/otp/request "{\"phone\":\"+55649${SUF}71\",\"purpose\":\"PASSWORD_RESET\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
X=$(post /auth/password/reset "{\"phone\":\"+55649${SUF}71\",\"code\":\"$C\",\"newPassword\":\"Nova12345\"}")
NT=$(echo "$X" | jq -r '.data.accessToken // empty')
if [ -n "$NT" ] && sucesso "$(post /auth/password/login "{\"email\":\"$EMAILP\",\"password\":\"Nova12345\"}")"; then
  ok "Passageiro: esqueci a senha (codigo do telefone + senha nova)"; TP="$NT"
else falha "Passageiro: esqueci a senha" "$X"; fi
X=$(patch /auth/perfil '{"gender":"FEMININO"}' "$TP")
[ "$(echo "$X" | jq -r '.data.genero' 2>/dev/null)" = "FEMININO" ] && ok "Passageiro: Meus dados atualizados" || falha "Passageiro: Meus dados" "$X"
P=$(post /auth/otp/request '{"phone":"+5511999990000","purpose":"LOGIN"}')
C=$(echo "$P" | jq -r '.data.debugCode // empty')
X=$(post /auth/otp/verify "{\"phone\":\"+5511999990000\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
[ -z "$(echo "$X" | jq -r '.data.accessToken // empty')" ] && ok "Seguranca: conta da Central nao entra por codigo" || falha "Seguranca: conta da Central entrou por codigo" "$(echo "$X" | jq -c '.data.user.role')"
EMB='{"latitude":-18.0125,"longitude":-49.3547,"address":"Praca da Matriz, Goiatuba"}'
DES='{"latitude":-18.0050,"longitude":-49.3610,"address":"Rodoviaria de Goiatuba"}'
X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":$DES}" "$TP")
sucesso "$X" && ok "Passageiro: preco da corrida calculado" || falha "Passageiro: preco da corrida" "$X"
X=$(get "/geo/search?q=Avenida%20Brasilia&lat=-18.0125&lng=-49.3547" "$TP")
N=$(echo "$X" | jq -r '.data | length' 2>/dev/null)
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Passageiro: busca de destino real ($N resultado(s), 1o: $(echo "$X" | jq -r '.data[0].address') - $(echo "$X" | jq -r '.data[0].detail'))" || falha "Passageiro: busca de destino" "$X"
X=$(get "/geo/reverse?lat=-18.0125&lng=-49.3547" "$TP")
[ -n "$(echo "$X" | jq -r '.data.address // empty')" ] && ok "Passageiro: endereco do embarque pelo GPS ($(echo "$X" | jq -r '.data.address'))" || falha "Passageiro: endereco do embarque" "$X"

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
X=$(post /drivers/onboarding "{\"name\":\"Motorista Teste Automatico\",\"cpf\":\"$CPF\",\"birthDate\":\"1990-05-10\",\"cnhNumber\":\"$CNH\",\"cnhCategory\":\"B\",\"cnhExpiresAt\":\"2031-01-01\"}" "$TM")
DID=$(echo "$X" | jq -r '.data.id // .data.driver.id // empty')
sucesso "$X" && ok "Motorista: cadastro (nome, CPF e CNH) aceito" || falha "Motorista: cadastro" "$X"
X=$(get /auth/me "$TM"); [ "$(echo "$X" | jq -r '.data.name')" = "Motorista Teste Automatico" ] && ok "Central ve o nome do motorista (nao mais \"Passageiro 1234\")" || falha "Motorista: nome no cadastro" "$X"
FOTO="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDDooor6E8k/9k="
X=$(post /documents/foto "{\"type\":\"CNH_FRONT\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
DOCURL=$(echo "$X" | jq -r '.data.fileUrl // empty')
[ "$(echo "$X" | jq -r '.data.status')" = "PENDING" ] && ok "Motorista: foto da CNH enviada (fica pendente para a Central)" || falha "Motorista: foto de documento" "$X"
PLACA="TST$((RANDOM%10))A$(printf '%02d' $((RANDOM%100)))"
X=$(post /vehicles "{\"plate\":\"$PLACA\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2021,\"color\":\"Branco\"}" "$TM")
sucesso "$X" && ok "Motorista: veiculo cadastrado depois do cadastro" || falha "Motorista: veiculo" "$X"

X=$(get "/admin/drivers?status=PENDING&limit=50" "$TA")
[ "$(echo "$X" | jq -r --arg d "$DID" '[.data.items[] | select(.id==$d) | .documents | type] | first')" = "array" ] && [ "$(echo "$X" | jq -r --arg d "$DID" '[.data.items[] | select(.id==$d) | .documents[0].fileUrl] | first')" = "$DOCURL" ] \
  && ok "Central: lista de pendentes com a foto do documento (antes a lista nem abria)" || falha "Central: lista de pendentes" "$(echo "$X" | jq -c '.data.items[0].documents' 2>/dev/null)"
C=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" "$API$DOCURL" -H "Authorization: Bearer $TA"); [ "$C" = "200 image/jpeg" ] && ok "Central: abre a foto do documento" || falha "Central: abrir foto" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API$DOCURL" -H "Authorization: Bearer $TP"); [ "$C" = "403" ] && ok "Seguranca: passageiro nao abre documento de motorista" || falha "Seguranca: foto de documento aberta" "$C"
X=$(patch "/admin/drivers/$DID/review" '{"status":"APPROVED","presentialCheck":true,"reason":"Conferencia presencial: teste automatico de ponta a ponta."}' "$TA")
sucesso "$X" && ok "Central: motorista aprovado com conferencia presencial" || falha "Central: aprovar motorista" "$X"
X=$(patch /drivers/me/online '{"isOnline":true}' "$TM"); sucesso "$X" && ok "Motorista: ficou disponivel" || falha "Motorista: ficar disponivel" "$X"
X=$(post /drivers/me/location '{"latitude":-18.0130,"longitude":-49.3550,"accuracy":10}' "$TM"); sucesso "$X" && ok "Motorista: posicao enviada" || falha "Motorista: posicao" "$X"
X=$(get "/rides/nearby-drivers?lat=-18.0125&lng=-49.3547" "$TP")
N=$(echo "$X" | jq -r '.data | length' 2>/dev/null)
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Passageiro: ve $N carro(s) disponivel(is) no mapa (dado real)" || falha "Passageiro: carros por perto" "$X"

X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":{\"address\":\"Porto Alegre - RS\",\"latitude\":-30.0346,\"longitude\":-51.2177}}" "$TP")
sucesso "$X" && falha "Destino a 1.800 km deveria ser recusado" "$X" || ok "Passageiro: destino fora da regiao recusado (antes saia corrida de R\$ 4.500)"
X=$(get "/geo/search?q=Porto%20Alegre&lat=-18.0128&lng=-49.3556" "$TP")
[ "$(echo "$X" | jq -r '[.data[] | select(.distanceKm > 80)] | length')" = "0" ] && ok "Passageiro: busca de destino so mostra lugares da regiao" || falha "Passageiro: busca fora da regiao" "$X"
CUP="TESTE$SUF$((RANDOM%100))"
X=$(post /admin/coupons "{\"code\":\"$CUP\",\"description\":\"Teste automatico\",\"discountType\":\"FIXED\",\"discountValue\":300,\"maxUses\":5}" "$TA")
sucesso "$X" && ok "Central: cupom $CUP criado (R\$ 3,00)" || falha "Central: criar cupom" "$X"
X=$(get /rides/coupons "$TP"); [ "$(echo "$X" | jq -r --arg c "$CUP" '[.data[] | select(.code==$c)] | length')" = "1" ] && ok "Passageiro: ve o cupom na tela Cupons" || falha "Passageiro: lista de cupons" "$X"
X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":$DES,\"couponCode\":\"$CUP\"}" "$TP")
[ "$(echo "$X" | jq -r '.data.discountCents')" = "300" ] && ok "Passageiro: estimativa ja mostra o desconto do cupom" || falha "Passageiro: estimativa com cupom" "$X"
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"CASH\",\"couponCode\":\"$CUP\"}" "$TP")
RID=$(echo "$X" | jq -r '.data.ride.id // empty')
sucesso "$X" && ok "Passageiro: corrida pedida" || falha "Passageiro: pedir corrida" "$X"
N=0; for t in 1 2 3 4 5; do sleep 3; X=$(get /driver/rides/offers "$TM"); N=$(echo "$X" | jq -r '.data | length' 2>/dev/null); [ "${N:-0}" -ge 1 ] 2>/dev/null && break; done
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Motorista: chamado chegou" || falha "Motorista: chamado chegou" "$X"
[ "$(echo "$X" | jq -r '.data[0].paymentMethodType' 2>/dev/null)" = "CASH" ] && ok "Motorista: chamado mostra a forma de pagamento (CASH)" || falha "Motorista: forma de pagamento no chamado" "$X"
X=$(post "/driver/rides/$RID/accept" '{}' "$TM")
PIN=$(echo "$X" | jq -r '.data.pin // empty')
sucesso "$X" && [ ${#PIN} -eq 4 ] && ok "Motorista: accept (PIN de embarque $PIN vindo do servidor)" || falha "Motorista: accept com PIN" "$X"
X=$(get "/rides/$RID" "$TP")
[ "$(echo "$X" | jq -r '.data.ride.status')" = "DRIVER_ASSIGNED" ] && [ "$(echo "$X" | jq -r '.data.ride.driver.user.name')" = "Motorista Teste Automatico" ] && [ "$(echo "$X" | jq -r '.data.ride.pin')" = "$PIN" ] && [ "$(echo "$X" | jq -r '.data.ride.driverPosition.latitude // empty')" != "" ] \
  && ok "Passageiro: acompanha o aceite de verdade (motorista, PIN e posicao do carro)" || falha "Passageiro: acompanhar a corrida" "$X"
for passo in arriving arrived start; do
  X=$(post "/driver/rides/$RID/$passo" '{"latitude":-18.0126,"longitude":-49.3548}' "$TM")
  sucesso "$X" && ok "Motorista: $passo" || falha "Motorista: $passo" "$X"
done
X=$(post "/driver/rides/$RID/finish" '{}' "$TM")
sucesso "$X" && ok "Motorista: corrida finalizada, valor $(echo "$X" | jq -r '.data.finalFareCents // "?"') centavos" || falha "Motorista: finalizar" "$X"
[ "$(echo "$X" | jq -r '.data.discountCents')" = "300" ] && [ "$(echo "$X" | jq -r '.data.toCollectCents')" = "$(( $(echo "$X" | jq -r '.data.finalFareCents') - 300 ))" ] \
  && ok "Motorista: sabe quanto cobrar com o cupom ($(echo "$X" | jq -r '.data.toCollectCents') centavos)" || falha "Motorista: valor com cupom" "$X"
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
BON=$(echo "$X" | jq -r '[.data.transactions[] | select(.type=="BONUS" and .amountCents==300)] | length' 2>/dev/null)
[ "${BON:-0}" -ge 1 ] && ok "Motorista: desconto do cupom creditado na carteira (pago pela plataforma)" || falha "Motorista: credito do cupom" "$X"
if sucesso "$X" && [ "${COM:-0}" -ge 1 ] && [ "${GAN:-1}" = "0" ]; then
  ok "Motorista: carteira pre-paga so descontou a comissao (saldo $(echo "$X" | jq -r '.data.balanceCents') centavos)"
else falha "Motorista: carteira pre-paga" "$X"; fi
X=$(post "/admin/drivers/$DID/wallet/credit" '{"amountCents":1000,"description":"Recarga via Pix (teste)"}' "$TA")
sucesso "$X" && ok "Central: recarga lancada, saldo agora $(echo "$X" | jq -r '.data.balanceCents') centavos" || falha "Central: lancar recarga" "$X"
X=$(get /admin/settings/central "$TA"); sucesso "$X" && ok "Central: contato de recarga carregado" || falha "Central: contato de recarga" "$X"
X=$(post "/rides/$RID/rate" '{"score":5,"tags":["Carro limpo"]}' "$TP")
[ "$(echo "$X" | jq -r '.data.score')" = "5" ] && ok "Passageiro: avaliou o motorista com 5 estrelas" || falha "Passageiro: avaliar" "$X"
X=$(get "/rides/$RID" "$TP"); [ "$(echo "$X" | jq -r '.data.ride.status')" = "COMPLETED" ] && [ "$(echo "$X" | jq -r '.data.ride.minhaNota')" = "5" ] && ok "Passageiro: recibo da corrida concluida com a nota" || falha "Passageiro: recibo" "$X"
X=$(post "/rides/favoritos/$DID" '{}' "$TP"); [ "$(echo "$X" | jq -r '.data.items[0].driverId')" = "$DID" ] && ok "Passageiro: motorista adicionado aos favoritos" || falha "Passageiro: favoritar" "$X"
X=$(post /auth/foto "{\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TP"); AV=$(echo "$X" | jq -r '.data.avatarUrl // empty')
C=$(curl -s -o /dev/null -w "%{http_code}" "$API$AV" -H "Authorization: Bearer $TM"); [ -n "$AV" ] && [ "$C" = "200" ] && ok "Passageiro: foto de perfil (o motorista consegue ver)" || falha "Passageiro: foto de perfil" "$X $C"
QUANDO=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"PIX\",\"scheduledFor\":\"$QUANDO\"}" "$TP"); RIDA=$(echo "$X" | jq -r '.data.ride.id // empty')
[ "$(echo "$X" | jq -r '.data.ride.status')" = "SCHEDULED" ] && ok "Passageiro: corrida agendada para daqui a 2 horas" || falha "Passageiro: agendar" "$X"
X=$(get /rides/scheduled "$TP"); [ "$(echo "$X" | jq -r --arg r "$RIDA" '[.data.items[] | select(.id==$r)] | length')" = "1" ] && ok "Passageiro: ve a agendada em Corridas agendadas" || falha "Passageiro: lista de agendadas" "$X"
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"scheduledFor\":\"$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ)\"}" "$TP"); sucesso "$X" && falha "Agendar com menos de 30 min deveria ser recusado" "$X" || ok "Passageiro: agendamento muito em cima da hora recusado"
X=$(post "/rides/$RIDA/cancel" '{"reason":"Teste"}' "$TP"); [ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_PASSENGER" ] && ok "Passageiro: cancelou a agendada" || falha "Passageiro: cancelar agendada" "$X"
# Segunda corrida: o motorista cancela depois de aceitar e o passageiro fica sabendo.
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"PIX\"}" "$TP"); RID2=$(echo "$X" | jq -r '.data.ride.id // empty')
N=0; for t in 1 2 3 4 5; do sleep 3; X=$(get /driver/rides/offers "$TM"); N=$(echo "$X" | jq -r '.data | length' 2>/dev/null); [ "${N:-0}" -ge 1 ] 2>/dev/null && break; done
post "/driver/rides/$RID2/accept" '{}' "$TM" >/dev/null
X=$(post "/driver/rides/$RID2/cancel" '{"reason":"Pneu furado (teste)"}' "$TM")
[ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_DRIVER" ] && ok "Motorista: cancelou a corrida aceita" || falha "Motorista: cancelar corrida" "$X"
X=$(get "/rides/$RID2" "$TP"); [ "$(echo "$X" | jq -r '.data.ride.status')" = "CANCELLED_BY_DRIVER" ] && ok "Passageiro: fica sabendo que o motorista cancelou" || falha "Passageiro: ver cancelamento do motorista" "$X"
# Terceira: o passageiro cancela enquanto procura (sem multa).
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"CASH\"}" "$TP"); RID3=$(echo "$X" | jq -r '.data.ride.id // empty')
X=$(post "/rides/$RID3/cancel" '{"reason":"Desisti (teste)"}' "$TP")
[ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_PASSENGER" ] && [ "$(echo "$X" | jq -r '.data.cancellationFeeCents')" = "0" ] && ok "Passageiro: cancelou enquanto procurava, sem taxa" || falha "Passageiro: cancelar" "$X"
X=$(get /rides/current "$TP"); [ "$(echo "$X" | jq -r '.data.ride')" = "null" ] && ok "Passageiro: nenhuma corrida aberta depois de cancelar" || falha "Passageiro: corrida atual" "$X"
X=$(get "/driver/rides/history" "$TM")
[ "$(echo "$X" | jq -r '.data.total' 2>/dev/null)" -ge 1 ] 2>/dev/null && ok "Motorista: historico de corridas com $(echo "$X" | jq -r '.data.total') corrida(s)" || falha "Motorista: historico de corridas" "$X"

# ---- Entrar pelo e-mail (conta nova) e o mesmo telefone virar motorista ----
EM2="passageiro2.${SUF}$((RANDOM%1000))@teste.fortalezamov.com.br"
P=$(post /auth/otp/request "{\"email\":\"$EM2\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
X=$(post /auth/otp/verify "{\"email\":\"$EM2\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TE=$(echo "$X" | jq -r '.data.accessToken // empty')
[ -n "$TE" ] && [ "$(echo "$X" | jq -r '.data.user.telefonePendente')" = "true" ] && ok "Passageiro: conta nova pelo codigo do e-mail (telefone pedido no cadastro)" || falha "Passageiro: entrar pelo e-mail" "$X"
CPF3=$(python3 -c "
import random
n=[random.randint(0,9) for _ in range(9)]
for k in (10,11):
    s=sum(d*(k-i) for i,d in enumerate(n)); r=(s*10)%11; n.append(0 if r==10 else r)
print(''.join(map(str,n)))")
X=$(post /auth/cadastro "{\"name\":\"Passageira Email Teste\",\"email\":\"$EM2\",\"gender\":\"FEMININO\",\"cpf\":\"$CPF3\",\"password\":\"Teste1234\",\"phone\":\"+55649${SUF}74\"${CID:+,\"city\":\"$CID\"}}" "$TE")
[ "$(echo "$X" | jq -r '.data.phone')" = "+55649${SUF}74" ] && ok "Passageiro: telefone gravado no cadastro de quem entrou pelo e-mail" || falha "Passageiro: telefone no cadastro" "$X"
TD=$(entrar "+55649${SUF}74" DRIVER)
X=$(get /auth/me "$TD")
[ "$(echo "$X" | jq -r '.data.role')" = "DRIVER" ] && ok "Mesmo telefone abre o app do motorista e vira motorista" || falha "Passageiro virar motorista" "$X"
X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":$DES}" "$TD")
sucesso "$X" && ok "Motorista tambem pede corrida como passageiro" || falha "Motorista pedir corrida como passageiro" "$X"
X=$(get "/rides/$RID" "$TE")
[ "$(echo "$X" | jq -r '.error.code // .code // empty')" != "" ] && [ "$(echo "$X" | jq -r '.data.ride.id // empty')" = "" ] && ok "Seguranca: outra conta nao ve a corrida (nem nome e telefone)" || falha "Seguranca: corrida de outra pessoa aberta" "$(echo "$X" | jq -c '.data.ride.id')"

patch /drivers/me/online '{"isOnline":false}' "$TM" >/dev/null
post "/rides/$RID/cancel" '{"reason":"Teste automatico"}' "$TP" >/dev/null
patch "/admin/drivers/$DID/review" '{"status":"SUSPENDED","reason":"Conta de teste automatico"}' "$TA" >/dev/null
CID_=$(get /admin/coupons "$TA" | jq -r --arg c "$CUP" '.data.items[] | select(.code==$c) | .id'); [ -n "$CID_" ] && patch "/admin/coupons/$CID_" '{"isActive":false}' "$TA" >/dev/null
echo | tee -a "$REL"; echo "Resultado: $FALHAS falha(s)." | tee -a "$REL"
exit $FALHAS
