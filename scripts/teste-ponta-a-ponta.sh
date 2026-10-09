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
# Como o aplicativo de verdade (sem a chave do teste): o codigo nunca volta na resposta.
post_app() { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' -d "$2"; }
patch() { curl -s -m 90 -X PATCH "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
put()   { curl -s -m 90 -X PUT "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()   { curl -s -m 90 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
sucesso() { echo "$1" | jq -e '.success == true' >/dev/null 2>&1; }
# Pedido de codigo com espera: 5 por minuto do mesmo IP (protecao do servidor).
pedir_codigo() {
  local r t
  for t in 1 2 3 4; do
    r=$(post "${2:-/auth/otp/request}" "$1" "${3:-}")
    echo "$r" | jq -e '.data.debugCode' >/dev/null 2>&1 && break
    sleep 20
  done
  echo "$r"
}
entrar() {
  local p c v t
  # O servidor aceita 5 pedidos de codigo por minuto do mesmo IP (protecao
  # contra abuso). O teste faz muitos logins seguidos: espera e tenta de novo.
  for t in 1 2 3 4; do
    p=$(post /auth/otp/request "{\"phone\":\"$1\",\"purpose\":\"LOGIN\"}")
    c=$(echo "$p" | jq -r '.data.debugCode // empty')
    [ -n "$c" ] && break
    sleep 20
  done
  v=$(post /auth/otp/verify "{\"phone\":\"$1\",\"code\":\"$c\",\"purpose\":\"LOGIN\",\"role\":\"$2\",\"device\":{\"deviceId\":\"teste-automatico\",\"platform\":\"ANDROID\"}}")
  echo "$v" | jq -r '.data.accessToken // empty'
}
echo "Teste de ponta a ponta - $(date -u '+%d/%m/%Y %H:%M UTC')" | tee -a "$REL"; echo | tee -a "$REL"

S=$(get /health); echo "$S" | grep -q '"status":"ok"' && ok "Servidor, banco e Redis no ar" || falha "Servidor, banco e Redis" "$S"
# Push (Firebase) ligado desde 09/10/2026: a chave tem que estar aceita pelo Google.
echo "$S" | grep -q '"push":"ok"' && ok "Aviso push (Firebase): Google aceitou a chave" || falha "Aviso push (Firebase)" "$S"

P=$(post /auth/otp/request "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
C=$(echo "$P" | jq -r '.data.debugCode // empty')
L=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${C:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
TA=$(echo "$L" | jq -r '.data.accessToken // empty')
[ "$(echo "$L" | jq -r '.data.user.role' 2>/dev/null)" = "ADMIN" ] && ok "Central: login do administrador pelo codigo do e-mail" || falha "Central: login do administrador pelo codigo do e-mail" "$P $L"
for rota in "/admin/drivers?status=PENDING" /admin/rides/active /admin/reports/summary /admin/tariffs; do
  X=$(get "$rota" "$TA"); sucesso "$X" && ok "Central carrega $rota" || falha "Central carrega $rota" "$X"
done

# ---- Varias cidades (Evandro, 08/10/2026): o dono ve todas; o operador de
# uma cidade entra na mesma Central e ve so a dele (operacao + recargas). ----
HOJE=$(TZ=America/Sao_Paulo date +%Y-%m-%d)
X=$(get /admin/eu "$TA")
[ "$(echo "$X" | jq -r '.data.dono')" = "true" ] && ok "Central: conta do dono ve todas as cidades ($(echo "$X" | jq -r '[.data.pracas[].nome] | join(", ")'))" || falha "Central: conta do dono" "$X"
PRACA=$(echo "$X" | jq -r '.data.pracas[0].id // empty')
SUFO=$(date +%H%M%S)
SENHA_OP="Teste${SUFO}ab"
EMAILO="operador.${SUFO}@teste.fortalezamov.com.br"
X=$(post /admin/equipe "{\"name\":\"Operador Teste Automatico\",\"email\":\"$EMAILO\",\"phone\":\"649${SUFO}88\",\"password\":\"$SENHA_OP\",\"praca\":\"$PRACA\"}" "$TA")
OPID=$(echo "$X" | jq -r '.data.id // empty')
[ -n "$OPID" ] && ok "Central: conta de operador da cidade $PRACA criada (equipe)" || falha "Central: criar operador" "$X"
L=$(post /auth/password/login "{\"email\":\"$EMAILO\",\"password\":\"$SENHA_OP\"}"); TO=$(echo "$L" | jq -r '.data.accessToken // empty')
X=$(get /admin/eu "$TO")
[ "$(echo "$X" | jq -r '.data.dono')" = "false" ] && [ "$(echo "$X" | jq -r '.data.praca')" = "$PRACA" ] && ok "Operador: entra na mesma Central e ve so a cidade dele" || falha "Operador: escopo da cidade" "$X $L"
X=$(get /admin/overview "$TO"); sucesso "$X" && ok "Operador: visao geral da cidade dele" || falha "Operador: visao geral" "$X"
X=$(get /admin/wallets "$TO"); sucesso "$X" && ok "Operador: carteiras / recargas da cidade" || falha "Operador: carteiras" "$X"
X=$(put /admin/tariffs/cobranca '{"modo":"TAXIMETRO"}' "$TO"); sucesso "$X" && falha "Operador nao deveria mudar tarifas" "$X" || ok "Operador: nao muda tarifas, cupons e comissao (so o dono)"
X=$(get /admin/limpeza "$TO"); sucesso "$X" && falha "Operador nao deveria acessar a limpeza" "$X" || ok "Operador: nao acessa a limpeza de dados"
X=$(get "/admin/relatorio?tipo=frota&de=$HOJE&ate=$HOJE" "$TO")
echo "$X" | jq -r '.data.arquivo // empty' | grep -q '^relatorio-praca-' && ok "Operador: relatorio da frota sai so com a cidade dele" || falha "Operador: relatorio da cidade" "$X"
X=$(get /admin/limpeza "$TA"); sucesso "$X" && ok "Central: limpeza de dados ($(echo "$X" | jq -r '.data.contasTeste') contas de teste, $(echo "$X" | jq -r '.data.corridas') corridas)" || falha "Central: resumo da limpeza" "$X"

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
P=$(pedir_codigo "{\"phone\":\"+55649${SUF}71\",\"purpose\":\"PASSWORD_RESET\"}")
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
[ -n "$(echo "$X" | jq -r '.data.address // empty' | grep -v '^Ponto no mapa')" ] && ok "Passageiro: endereco do embarque pelo GPS ($(echo "$X" | jq -r '.data.address'))" || falha "Passageiro: endereco do embarque" "$X"

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
# ---- Mesma pessoa nos dois apps (Evandro, 08/10): quem ja e passageiro abre
# o app do motorista com OUTRO telefone e usa o mesmo e-mail e CPF. Nao pode
# impedir: confirma com o codigo enviado a conta de passageiro e usa ela.
gerar_cpf() { python3 -c "
import random
n=[random.randint(0,9) for _ in range(9)]
for k in (10,11):
    s=sum(d*(k-i) for i,d in enumerate(n)); r=(s*10)%11; n.append(0 if r==10 else r)
print(''.join(map(str,n)))"; }
gerar_cnh() { python3 -c "import random;print(''.join(str(random.randint(0,9)) for _ in range(11)))"; }
FONE_V="+55649${SUF}75"; CPFV=$(gerar_cpf); EMAILV="dupla.${SUF}$((RANDOM%1000))@teste.fortalezamov.com.br"
TPV=$(entrar "$FONE_V" PASSENGER); post /auth/accept-terms '{"version":"1.0.0"}' "$TPV" >/dev/null
post /auth/cadastro "{\"name\":\"Pessoa Dois Apps\",\"email\":\"$EMAILV\",\"gender\":\"NAO_INFORMAR\",\"cpf\":\"$CPFV\",\"password\":\"Teste1234\"${CID:+,\"city\":\"$CID\"}}" "$TPV" >/dev/null
IDV=$(get /auth/me "$TPV" | jq -r '.data.id')
TOUTRO=$(entrar "+55649${SUF}76" DRIVER); post /auth/accept-terms '{"version":"1.0.0"}' "$TOUTRO" >/dev/null
CNHV=$(gerar_cnh)
DADOSV="\"name\":\"Pessoa Dois Apps\",\"email\":\"$EMAILV\",\"cpf\":\"$CPFV\",\"birthDate\":\"1988-03-10\",\"cnhNumber\":\"$CNHV\",\"cnhCategory\":\"B\",\"cnhExpiresAt\":\"2031-01-01\""
X=$(post /drivers/onboarding "{$DADOSV}" "$TOUTRO")
DESTV="e-mail d•••@teste.fortalezamov.com.br"
[ "$(echo "$X" | jq -r '.error.code')" = "CONTA_EXISTENTE" ] && [ "$(echo "$X" | jq -r '.error.details.destino')" = "$DESTV" ] && [ "$(get /drivers/me "$TOUTRO" | jq -r '.success')" = "false" ] \
  && ok "Motorista: mesmo e-mail/CPF da conta de passageiro reconhecido (codigo vai para o $DESTV)" || falha "Motorista: reconhecer a conta de passageiro" "$X"
X=$(pedir_codigo "{\"email\":\"$EMAILV\",\"cpf\":\"$CPFV\"}" /auth/vincular-conta/codigo "$TOUTRO"); CV=$(echo "$X" | jq -r '.data.debugCode // empty')
[ -n "$CV" ] && [ "$(echo "$X" | jq -r '.data.destino')" = "$DESTV" ] && ok "Motorista: codigo enviado para a conta de passageiro" || falha "Motorista: codigo para a conta existente" "$X"
X=$(post /auth/vincular-conta/entrar "{\"email\":\"$EMAILV\",\"cpf\":\"$CPFV\",\"code\":\"000000\"}" "$TOUTRO")
sucesso "$X" && falha "Codigo errado deveria ser recusado" "$X" || ok "Seguranca: codigo errado nao entra na conta de outra pessoa"
X=$(post /auth/vincular-conta/entrar "{\"email\":\"$EMAILV\",\"cpf\":\"$CPFV\",\"code\":\"$CV\"}" "$TOUTRO"); TV=$(echo "$X" | jq -r '.data.accessToken // empty')
[ -n "$TV" ] && [ "$(echo "$X" | jq -r '.data.user.id')" = "$IDV" ] && ok "Motorista: entrou na MESMA conta do passageiro com o codigo" || falha "Motorista: entrar na conta existente" "$X"
X=$(post /drivers/onboarding "{$DADOSV}" "$TV"); DIDV=$(echo "$X" | jq -r '.data.id // empty')
sucesso "$X" && ok "Motorista: cadastro feito na conta de passageiro, com os mesmos dados" || falha "Motorista: cadastro na conta existente" "$X"
X=$(get /rides/current "$TV"); sucesso "$X" && ok "A mesma conta continua pedindo corrida no app do passageiro" || falha "Conta dupla: app do passageiro" "$X"
X=$(patch "/admin/drivers/$DIDV/review" '{"status":"APPROVED","presentialCheck":true,"reason":"Conferido pessoalmente"}' "$TA")
[ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && ok "Central: aprovou sem fotos (conferencia presencial)" || falha "Central: aprovar sem fotos" "$X"

# ---- Central cadastra o motorista direto (Evandro, 08/10): ja aprovado, com
# carro; o motorista so entra no app com o telefone e o codigo.
# Numero digitado errado (Evandro: 6631 em vez de 6632): a conta nova e vazia
# pode ser desfeita logo depois de entrar; conta com cadastro nao.
FONE_X="+55649${SUF}70"; TX=$(entrar "$FONE_X" DRIVER)
X=$(post /auth/desfazer-conta-nova '{}' "$TX"); [ "$(echo "$X" | jq -r '.data.desfeita')" = "true" ] && ok "Numero errado: conta nova vazia desfeita" || falha "Numero errado: desfazer conta nova" "$X"
X=$(get /auth/me "$TX"); sucesso "$X" && falha "Conta desfeita ainda existe" "$X" || ok "Numero errado: a conta desfeita sumiu"
X=$(post /auth/desfazer-conta-nova '{}' "$TV"); sucesso "$X" && falha "Conta com cadastro de motorista nao pode ser desfeita" "$X" || ok "Seguranca: conta com cadastro nao e desfeita"
# Codigo por e-mail para todos (Evandro, 08/10/2026): telefone sem conta nao
# recebe codigo na tela; o app pede o e-mail e a conta nasce por ele.
X=$(post_app /auth/otp/request "{\"phone\":\"+55649${SUF}69\",\"purpose\":\"LOGIN\"}")
[ "$(echo "$X" | jq -r '.error.code')" = "TELEFONE_SEM_CONTA" ] && [ -z "$(echo "$X" | jq -r '.data.debugCode // empty')" ] \
  && ok "Seguranca: telefone novo nao recebe codigo na tela (o app pede o e-mail)" || falha "Telefone novo sem codigo na tela" "$X"
FONE_C="+55649${SUF}78"; CPFC=$(gerar_cpf); CNHC=$(gerar_cnh); PLACAC="TST$(printf '%04d' $((RANDOM%10000)))"
CORPOC="{\"name\":\"Motorista Pela Central\",\"phone\":\"(64) 9${SUF}78\",\"cpf\":\"$CPFC\",\"birthDate\":\"1985-07-20\",\"cnhNumber\":\"$CNHC\",\"cnhCategory\":\"B\",\"cnhExpiresAt\":\"2032-05-01\",\"vehicle\":{\"plate\":\"$PLACAC\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2021,\"color\":\"Branco\"},\"aprovar\":true}"
X=$(post /admin/drivers "$CORPOC" "$TA"); DIDC=$(echo "$X" | jq -r '.data.id // empty')
[ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && [ "$(echo "$X" | jq -r '.data.contaExistente')" = "false" ] && ok "Central: cadastrou motorista novo ja aprovado (placa $PLACAC)" || falha "Central: cadastrar motorista" "$X"
X=$(post /admin/drivers "$CORPOC" "$TA"); sucesso "$X" && falha "Mesmo telefone duas vezes deveria ser recusado" "$X" || ok "Central: nao cadastra o mesmo motorista duas vezes"
TC=$(entrar "$FONE_C" DRIVER)
X=$(get /drivers/me "$TC"); [ "$(echo "$X" | jq -r '.data.id')" = "$DIDC" ] && [ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && ok "Motorista da Central: entra so com telefone e codigo e ja esta aprovado" || falha "Motorista da Central: entrar" "$X"
X=$(get /vehicles/me "$TC"); [ "$(echo "$X" | jq -r '(.data | if type=="array" then . else (.items // []) end)[0].plate')" = "$PLACAC" ] && ok "Motorista da Central: carro ja cadastrado" || falha "Motorista da Central: carro" "$X"
X=$(get /auth/me "$TC"); [ "$(echo "$X" | jq -r '.data.driverStatus')" = "APPROVED" ] && [ "$(echo "$X" | jq -r '.data.name')" = "Motorista Pela Central" ] && ok "Motorista da Central: nome e aprovacao no login" || falha "Motorista da Central: dados no login" "$X"
FONE_W="+55649${SUF}73"; TPW=$(entrar "$FONE_W" PASSENGER)
X=$(post /admin/drivers "{\"name\":\"Passageiro Vira Motorista\",\"phone\":\"$FONE_W\",\"cpf\":\"$(gerar_cpf)\",\"birthDate\":\"1990-01-02\",\"cnhNumber\":\"$(gerar_cnh)\",\"cnhCategory\":\"AB\",\"cnhExpiresAt\":\"2030-01-01\",\"vehicle\":{\"plate\":\"TSU$(printf '%04d' $((RANDOM%10000)))\",\"brand\":\"VW\",\"model\":\"Gol\",\"year\":2015,\"color\":\"Prata\"}}" "$TA")
DIDW=$(echo "$X" | jq -r '.data.id // empty')
[ -n "$TPW" ] && [ "$(echo "$X" | jq -r '.data.contaExistente')" = "true" ] && [ "$(get /auth/me "$TPW" | jq -r '.data.id')" = "$(echo "$X" | jq -r '.data.userId')" ] && ok "Central: motorista com o telefone de um passageiro usa a mesma conta" || falha "Central: motorista na conta de passageiro" "$X"

X=$(post /drivers/onboarding "{\"name\":\"Motorista Teste Automatico\",\"cpf\":\"$CPF\",\"birthDate\":\"1990-05-10\",\"cnhNumber\":\"$CNH\",\"cnhCategory\":\"B\",\"cnhExpiresAt\":\"2031-01-01\"}" "$TM")
DID=$(echo "$X" | jq -r '.data.id // .data.driver.id // empty')
sucesso "$X" && ok "Motorista: cadastro (nome, CPF e CNH) aceito" || falha "Motorista: cadastro" "$X"
X=$(get /auth/me "$TM"); [ "$(echo "$X" | jq -r '.data.name')" = "Motorista Teste Automatico" ] && ok "Central ve o nome do motorista (nao mais \"Passageiro 1234\")" || falha "Motorista: nome no cadastro" "$X"
FOTO="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDDooor6E8k/9k="
X=$(post /documents/foto "{\"type\":\"CNH_FRONT\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
DOCURL=$(echo "$X" | jq -r '.data.fileUrl // empty')
[ "$(echo "$X" | jq -r '.data.status')" = "PENDING" ] && ok "Motorista: foto da CNH enviada (fica pendente para a Central)" || falha "Motorista: foto de documento" "$X"
PLACA="TST$((RANDOM%10))A$(printf '%02d' $((RANDOM%100)))"
# Dois envios no mesmo instante (toque duplo no celular): os dois tem que dar certo.
CORPOV="{\"plate\":\"$PLACA\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2021,\"color\":\"Branco\"}"
V1=$(mktemp); V2=$(mktemp)
post /vehicles "$CORPOV" "$TM" > "$V1" & post /vehicles "$CORPOV" "$TM" > "$V2" & wait
X=$(cat "$V1"); Y=$(cat "$V2")
sucesso "$X" && ok "Motorista: veiculo cadastrado depois do cadastro" || falha "Motorista: veiculo" "$X"
sucesso "$Y" && [ "$(echo "$X" | jq -r '.data.id')" = "$(echo "$Y" | jq -r '.data.id')" ] && ok "Motorista: toque duplo no envio nao da erro (mesmo carro)" || falha "Motorista: envio duplo do veiculo" "$Y"
X=$(get /admin/overview "$TA")
[ "$(echo "$X" | jq -r '.data.driversPending')" -ge 1 ] 2>/dev/null && [ "$(echo "$X" | jq -r '.data.latestPendingDriver.id')" = "$DID" ] \
  && ok "Central: aviso de motorista novo aguardando aprovacao ($(echo "$X" | jq -r '.data.driversPending') pendente(s))" || falha "Central: aviso de motorista pendente" "$X"

X=$(get "/admin/drivers?status=PENDING&limit=50" "$TA")
[ "$(echo "$X" | jq -r --arg d "$DID" '[.data.items[] | select(.id==$d) | .documents | type] | first')" = "array" ] && [ "$(echo "$X" | jq -r --arg d "$DID" '[.data.items[] | select(.id==$d) | .documents[0].fileUrl] | first')" = "$DOCURL" ] \
  && ok "Central: lista de pendentes com a foto do documento (antes a lista nem abria)" || falha "Central: lista de pendentes" "$(echo "$X" | jq -c '.data.items[0].documents' 2>/dev/null)"
X=$(get "/admin/drivers/$DID" "$TA"); [ "$(echo "$X" | jq -r '.data.documents[0].fileUrl')" = "$DOCURL" ] && ok "Central: detalhe do motorista com a foto do documento" || falha "Central: detalhe do motorista" "$(echo "$X" | jq -c '.data.documents' 2>/dev/null)"
C=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" "$API$DOCURL" -H "Authorization: Bearer $TA"); [ "$C" = "200 image/jpeg" ] && ok "Central: abre a foto do documento" || falha "Central: abrir foto" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API$DOCURL" -H "Authorization: Bearer $TP"); [ "$C" = "403" ] && ok "Seguranca: passageiro nao abre documento de motorista" || falha "Seguranca: foto de documento aberta" "$C"
X=$(patch "/admin/drivers/$DID/review" '{"status":"APPROVED","presentialCheck":true,"reason":"Conferencia presencial: teste automatico de ponta a ponta."}' "$TA")
sucesso "$X" && ok "Central: motorista aprovado com conferencia presencial" || falha "Central: aprovar motorista" "$X"
X=$(get /drivers/me "$TM"); [ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && ok "App do motorista ve a aprovacao (botao Atualizar status)" || falha "Motorista: ver aprovacao" "$(echo "$X" | jq -c '.data.status')"

# Foto de perfil do motorista (Evandro, 09/10/2026): o motorista troca pelo
# app, a Central confere; a Central tambem poe/troca a foto.
avatar_de() { get /auth/me "$1" | jq -r '.data.avatarUrl // empty'; }
X=$(post /documents/foto "{\"type\":\"PROFILE_PHOTO\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
F1=$(echo "$X" | jq -r '.data.fileUrl // empty'); D1=$(echo "$X" | jq -r '.data.id // empty')
[ -n "$F1" ] && [ "$(echo "$X" | jq -r '.data.aguardaCentral')" = "false" ] && [ "$(avatar_de "$TM")" = "$F1" ] \
  && ok "Motorista: primeira foto de perfil ja aparece" || falha "Motorista: primeira foto de perfil" "$X"
X=$(patch "/admin/documents/$D1/review" '{"status":"APPROVED"}' "$TA"); sucesso "$X" && ok "Central: aprova a foto de perfil" || falha "Central: aprovar foto de perfil" "$X"
X=$(post /documents/foto "{\"type\":\"PROFILE_PHOTO\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
D2=$(echo "$X" | jq -r '.data.id // empty')
[ "$(echo "$X" | jq -r '.data.aguardaCentral')" = "true" ] && [ "$(avatar_de "$TM")" = "$F1" ] \
  && ok "Motorista: troca a foto; o passageiro continua vendo a aprovada ate a Central conferir" || falha "Motorista: trocar foto de perfil" "$X"
X=$(get /admin/overview "$TA")
[ "$(echo "$X" | jq -r '.data.documentsToReview')" -ge 1 ] 2>/dev/null && [ "$(echo "$X" | jq -r '.data.latestDocumentToReview.id')" = "$D2" ] && [ "$(echo "$X" | jq -r '.data.latestDocumentToReview.type')" = "PROFILE_PHOTO" ] \
  && ok "Central: aviso de foto nova para conferir" || falha "Central: aviso de foto para conferir" "$(echo "$X" | jq -c '.data | {documentsToReview, latestDocumentToReview}' 2>/dev/null)"
X=$(get /drivers/me "$TM"); [ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && ok "Motorista: continua aprovado enquanto a foto nova espera" || falha "Motorista: status com foto nova" "$(echo "$X" | jq -c '.data.status')"
X=$(patch "/admin/documents/$D2/review" '{"status":"REJECTED","rejectionReason":"Foto escura, mande outra"}' "$TA")
sucesso "$X" && [ "$(avatar_de "$TM")" = "$F1" ] && ok "Central: recusa a foto nova e a aprovada continua" || falha "Central: recusar foto nova" "$X"
X=$(post /documents/foto "{\"type\":\"PROFILE_PHOTO\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
F3=$(echo "$X" | jq -r '.data.fileUrl // empty'); D3=$(echo "$X" | jq -r '.data.id // empty')
X=$(patch "/admin/documents/$D3/review" '{"status":"APPROVED"}' "$TA")
N=$(get "/admin/drivers/$DID" "$TA" | jq -r '[.data.documents[] | select(.type=="PROFILE_PHOTO")] | length')
sucesso "$X" && [ "$(avatar_de "$TM")" = "$F3" ] && [ "$N" = "1" ] && ok "Central: aprova a foto nova; ela passa a aparecer e a antiga sai" || falha "Central: aprovar foto nova ($N fotos)" "$X"
X=$(post "/admin/drivers/$DID/foto" "{\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TA")
F4=$(echo "$X" | jq -r '.data.avatarUrl // empty')
N=$(get "/admin/drivers/$DID" "$TA" | jq -r '[.data.documents[] | select(.type=="PROFILE_PHOTO")] | length')
AV4=$(avatar_de "$TM"); [ -z "$AV4" ] && { sleep 5; AV4=$(avatar_de "$TM"); }
[ -n "$F4" ] && [ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && [ "$AV4" = "$F4" ] && [ "$N" = "1" ] \
  && ok "Central: poe a foto do motorista (ja aprovada)" || falha "Central: por a foto do motorista (no perfil: ${AV4:-vazio}; fotos de perfil: $N)" "$X"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API$F4" -H "Authorization: Bearer $TP"); [ "$C" = "200" ] && ok "Passageiro: ve a foto do motorista" || falha "Passageiro: foto do motorista" "$C"
X=$(post "/admin/drivers/$DID/foto" "{\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TP"); sucesso "$X" && falha "Seguranca: passageiro trocou foto de motorista" "$X" || ok "Seguranca: so a Central troca a foto do motorista"
# (A foto da CNH enviada no cadastro continua para conferir: so a FOTO DE
# PERFIL deste motorista tem que ter saido da fila.)
X=$(get /admin/overview "$TA"); [ "$(echo "$X" | jq -r --arg d "$DID" 'if .data.latestDocumentToReview == null then "ok" elif .data.latestDocumentToReview.driverId == $d and .data.latestDocumentToReview.type == "PROFILE_PHOTO" then "ainda" else "ok" end')" = "ok" ] \
  && ok "Central: aviso de foto some depois de conferida" || falha "Central: aviso de foto continua" "$(echo "$X" | jq -c '.data.latestDocumentToReview' 2>/dev/null)"

# Carros do motorista (Evandro, 09/10/2026): cadastrar outro carro, a Central
# confere, trocar o carro em uso, corrigir e tirar.
X=$(get /vehicles/me "$TM"); VID1=$(echo "$X" | jq -r '.data[0].id // empty')
[ "$(echo "$X" | jq -r '.data | length')" = "1" ] && [ "$(echo "$X" | jq -r '.data[0].situacao')" = "EM_USO" ] && ok "Motorista: carro do cadastro em uso" || falha "Motorista: lista de carros" "$X"
PLACA2="TSU$((RANDOM%10))B$(printf '%02d' $((RANDOM%100)))"
X=$(post /vehicles "{\"plate\":\"$PLACA2\",\"brand\":\"Chevrolet\",\"model\":\"Onix\",\"year\":2023,\"color\":\"Prata\"}" "$TM")
VID2=$(echo "$X" | jq -r '.data.id // empty')
[ "$(echo "$X" | jq -r '.data.situacao')" = "PENDENTE" ] && [ "$(echo "$X" | jq -r '.data.isActive')" = "false" ] && ok "Motorista: carro novo vai para a Central conferir" || falha "Motorista: cadastrar outro carro" "$X"
X=$(post "/vehicles/$VID2/usar" '{}' "$TM"); sucesso "$X" && falha "Motorista usou carro sem a Central conferir" "$X" || ok "Motorista: carro novo so roda depois da Central conferir"
X=$(post "/vehicles/$VID2/foto" "{\"tipo\":\"FOTO\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
Y=$(post "/vehicles/$VID2/foto" "{\"tipo\":\"CRLV\",\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TM")
[ -n "$(echo "$Y" | jq -r '.data.fotoUrl // empty')" ] && [ -n "$(echo "$Y" | jq -r '.data.crlvUrl // empty')" ] && ok "Motorista: foto e CRLV do carro novo enviados" || falha "Motorista: fotos do carro novo" "$X $Y"
X=$(get /admin/overview "$TA")
[ "$(echo "$X" | jq -r '.data.latestDocumentToReview.type')" = "VEHICLE" ] && [ "$(echo "$X" | jq -r '.data.latestDocumentToReview.id')" = "$VID2" ] \
  && ok "Central: aviso de carro novo para conferir" || falha "Central: aviso de carro novo" "$(echo "$X" | jq -c '.data.latestDocumentToReview' 2>/dev/null)"
X=$(get "/admin/drivers/$DID/vehicles" "$TA"); [ "$(echo "$X" | jq -r --arg v "$VID2" '[.data[] | select(.id==$v) | .situacao] | first')" = "PENDENTE" ] && ok "Central: ve os carros do motorista com a situacao" || falha "Central: carros do motorista" "$X"
X=$(patch "/admin/vehicles/$VID2/review" '{"aprovar":false,"motivo":"CRLV ilegivel"}' "$TA")
[ "$(echo "$X" | jq -r --arg v "$VID2" '[.data[] | select(.id==$v) | .situacao] | first')" = "RECUSADO" ] && ok "Central: recusa o carro novo com motivo" || falha "Central: recusar carro" "$X"
X=$(patch "/vehicles/$VID2" '{"color":"Preto"}' "$TM")
[ "$(echo "$X" | jq -r '.data.situacao')" = "PENDENTE" ] && [ "$(echo "$X" | jq -r '.data.color')" = "Preto" ] && ok "Motorista: corrige o carro recusado e ele volta para a Central" || falha "Motorista: corrigir carro" "$X"
X=$(patch "/vehicles/$VID2" '{"plate":"ZZZ9Z99"}' "$TM"); sucesso "$X" && falha "Motorista trocou a placa sem a Central" "$X" || ok "Motorista: outra placa so como carro novo"
X=$(patch "/admin/vehicles/$VID2/review" '{"aprovar":true}' "$TA")
[ "$(echo "$X" | jq -r --arg v "$VID2" '[.data[] | select(.id==$v) | .situacao] | first')" = "GUARDADO" ] && ok "Central: aprova o carro novo (fica guardado ate ele trocar)" || falha "Central: aprovar carro" "$X"
X=$(post "/vehicles/$VID2/usar" '{}' "$TM")
[ "$(echo "$X" | jq -r --arg v "$VID2" '[.data[] | select(.id==$v) | .situacao] | first')" = "EM_USO" ] && [ "$(echo "$X" | jq -r --arg v "$VID1" '[.data[] | select(.id==$v) | .situacao] | first')" = "GUARDADO" ] \
  && ok "Motorista: troca o carro em uso (um so em uso)" || falha "Motorista: trocar carro" "$X"
X=$(post "/vehicles/$VID1/usar" '{}' "$TM"); [ "$(echo "$X" | jq -r --arg v "$VID1" '[.data[] | select(.id==$v) | .situacao] | first')" = "EM_USO" ] && ok "Motorista: volta para o primeiro carro" || falha "Motorista: voltar carro" "$X"
PLACA3="TSV$((RANDOM%10))C$(printf '%02d' $((RANDOM%100)))"
X=$(post "/admin/drivers/$DID/vehicles" "{\"plate\":\"$PLACA3\",\"brand\":\"Fiat\",\"model\":\"Mobi\",\"year\":2020,\"color\":\"Vermelho\"}" "$TA")
VID3=$(echo "$X" | jq -r --arg p "$PLACA3" '[.data[] | select(.plate==$p) | .id] | first // empty')
[ "$(echo "$X" | jq -r --arg p "$PLACA3" '[.data[] | select(.plate==$p) | .situacao] | first')" = "GUARDADO" ] && ok "Central: cadastra outro carro para o motorista (ja conferido)" || falha "Central: cadastrar carro" "$X"
C=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/vehicles/$VID3" -H "Authorization: Bearer $TM")
X=$(curl -s -X DELETE "$API/admin/vehicles/$VID2" -H "Authorization: Bearer $TA")
N=$(get /vehicles/me "$TM" | jq -r '.data | length')
[ "$C" = "204" ] && sucesso "$X" && [ "$N" = "1" ] && ok "Motorista e Central tiram carros (fica so o em uso)" || falha "Tirar carros ($C, $N carros)" "$X"
X=$(get /drivers/me "$TM"); [ "$(echo "$X" | jq -r '.data.status')" = "APPROVED" ] && ok "Motorista: continua aprovado depois das trocas de carro" || falha "Motorista: status depois dos carros" "$(echo "$X" | jq -c '.data.status')"

# Excluir passageiro pela Central (Evandro, 09/10/2026).
TX=$(entrar "+55649${SUF}83" PASSENGER); PXID=$(get /auth/me "$TX" | jq -r '.data.id // empty')
X=$(post /admin/passengers/excluir "{\"ids\":[\"$PXID\"]}" "$TA")
[ "$(echo "$X" | jq -r '.data.excluidos')" = "1" ] && [ "$(echo "$X" | jq -r '.data.itens[0].resultado')" = "APAGADO" ] && ok "Central: exclui passageiro sem corridas (sai de vez)" || falha "Central: excluir passageiro" "$X"
X=$(get "/admin/passengers?search=${SUF}83" "$TA"); [ "$(echo "$X" | jq -r '.data.items | length')" = "0" ] && ok "Central: passageiro excluido some da lista" || falha "Central: passageiro excluido ainda na lista" "$X"
MUID=$(get /auth/me "$TM" | jq -r '.data.id // empty')
X=$(post /admin/passengers/excluir "{\"ids\":[\"$MUID\"]}" "$TA")
[ "$(echo "$X" | jq -r '.data.excluidos')" = "0" ] && echo "$X" | jq -r '.data.itens[0].erro' | grep -q "motorista" && ok "Central: conta de motorista nao sai pela aba Passageiros" || falha "Central: excluir passageiro que e motorista" "$X"
X=$(post /admin/passengers/excluir "{\"ids\":[\"$PXID\"]}" "$TM"); sucesso "$X" && falha "Seguranca: motorista excluiu passageiro" "$X" || ok "Seguranca: so a Central exclui passageiro"

# Excluir a propria conta (exigencia da Google Play, 09/10/2026).
X=$(curl -s -m 60 "$API/conta/exclusao"); echo "$X" | grep -q "Excluir sua conta da Fortaleza Mov" && echo "$X" | grep -q '<form method="post"' && ok "Pagina publica de exclusao de conta no ar" || falha "Pagina de exclusao de conta" "$(echo "$X" | head -c 200)"
X=$(curl -s -m 60 "$API/legal/privacidade"); echo "$X" | grep -q "<h1>" && echo "$X" | grep -qi "LGPD" && ok "Politica de privacidade em pagina de internet" || falha "Pagina da politica de privacidade" "$(echo "$X" | head -c 200)"
TXX=$(entrar "+55649${SUF}84" PASSENGER)
X=$(post /conta/excluir '{}' "$TXX"); sucesso "$X" && falha "Excluir conta sem confirmar deveria ser recusado" "$X" || ok "Seguranca: exclusao da conta pede confirmacao"
X=$(post /conta/excluir '{"confirmacao":"EXCLUIR"}' "$TXX")
[ "$(echo "$X" | jq -r '.data.ok')" = "true" ] && ok "Passageiro: exclui a propria conta pelo app ($(echo "$X" | jq -r '.data.resultado'))" || falha "Passageiro: excluir a propria conta" "$X"
X=$(get /auth/me "$TXX"); sucesso "$X" && falha "Conta excluida ainda entra" "$X" || ok "Conta excluida nao entra mais"
X=$(patch /drivers/me/online '{"isOnline":true}' "$TM"); sucesso "$X" && falha "Motorista sem saldo nao deveria ficar disponivel" "$X" || ok "Carteira: motorista com saldo zero nao fica disponivel ($(echo "$X" | jq -r '.error.message' | cut -c1-60)...)"
X=$(post "/admin/drivers/$DID/wallet/credit" '{"amountCents":5000,"operation":"CREDIT","description":"Recarga PIX inicial (teste)"}' "$TA")
[ "$(echo "$X" | jq -r '.data.balanceCents')" = "5000" ] && ok "Central: recarga de R\$ 50,00 (credito no extrato)" || falha "Central: recarga inicial" "$X"
X=$(patch /drivers/me/online '{"isOnline":true}' "$TM"); sucesso "$X" && ok "Motorista: ficou disponivel" || falha "Motorista: ficar disponivel" "$X"
X=$(post /drivers/me/location '{"latitude":-18.0130,"longitude":-49.3550,"accuracy":10}' "$TM"); sucesso "$X" && ok "Motorista: posicao enviada" || falha "Motorista: posicao" "$X"
X=$(get "/rides/nearby-drivers?lat=-18.0125&lng=-49.3547" "$TP")
N=$(echo "$X" | jq -r '.data | length' 2>/dev/null)
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Passageiro: ve $N carro(s) disponivel(is) no mapa (dado real)" || falha "Passageiro: carros por perto" "$X"

X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":{\"address\":\"Porto Alegre - RS\",\"latitude\":-30.0346,\"longitude\":-51.2177}}" "$TP")
[ "$(echo "$X" | jq -r '.data.distanceMeters')" -gt 1000000 ] 2>/dev/null && ok "Passageiro: ve o preco para fora da regiao (Porto Alegre, $(echo "$X" | jq -r '.data.distanceMeters/1000|floor') km)" || falha "Passageiro: preco para longe" "$X"
X=$(get "/geo/search?q=Porto%20Alegre&lat=-18.0128&lng=-49.3556" "$TP")
[ "$(echo "$X" | jq -r '[.data[] | select(.distanceKm > 1000)] | length')" -ge 1 ] 2>/dev/null && ok "Passageiro: busca acha destino fora da regiao (Porto Alegre)" || falha "Passageiro: busca fora da regiao" "$X"
X=$(get "/geo/search?q=Rua%20Sao%20Paulo&lat=-18.0128&lng=-49.3556" "$TP")
[ "$(echo "$X" | jq -r '(.data | length) > 0 and ((.data[0].distanceKm // 9999) < 80)')" = "true" ] && ok "Passageiro: rua com nome comum acha primeiro a da cidade" || falha "Passageiro: busca da regiao primeiro" "$X"
# Rota pelas ruas (Evandro, 08/10/2026: "nao aquele risco verde que parece rota de aviao").
X=$(get "/geo/rota?deLat=-18.0125&deLng=-49.3547&paraLat=-18.0050&paraLng=-49.3610" "$TP")
[ "$(echo "$X" | jq -r '.data.porRua')" = "true" ] && [ "$(echo "$X" | jq -r '.data.pontos | length')" -ge 3 ] 2>/dev/null \
  && ok "Mapa: rota pelas ruas ($(echo "$X" | jq -r '.data.pontos | length') pontos, $(echo "$X" | jq -r '.data.distanceMeters') m)" || falha "Mapa: rota pelas ruas" "$(echo "$X" | jq -c '{porRua:.data.porRua, n:(.data.pontos|length), d:.data.distanceMeters}' 2>/dev/null)"
X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":{\"address\":\"Goiania - GO\",\"latitude\":-16.6869,\"longitude\":-49.2648}}" "$TP")
MIN=$(echo "$X" | jq -r '(.data.durationSeconds // 0) / 60 | floor')
[ "${MIN:-0}" -ge 60 ] 2>/dev/null && [ "${MIN:-0}" -le 300 ] 2>/dev/null && ok "Passageiro: tempo de viagem pela estrada (Goiania: $MIN min, antes dava 479)" || falha "Passageiro: tempo pela estrada" "$(echo "$X" | jq -c '{d:.data.distanceMeters,t:.data.durationSeconds}' 2>/dev/null)"
X=$(get /admin/tariffs "$TA"); C=$(echo "$X" | jq -r '.data.cobranca')
[ "$C" = "TAXIMETRO" ] || [ "$C" = "FECHADO" ] && ok "Central: modo de cobranca em Tarifas ($C)" || falha "Central: modo de cobranca" "$C"
# Renovacao do login (refresh): sem ela o app travava com "Token de acesso
# ausente ou invalido" quando o acesso vencia (Evandro, 05/10/2026).
P=$(pedir_codigo "{\"phone\":\"+55649${SUF}79\",\"purpose\":\"LOGIN\"}"); C=$(echo "$P" | jq -r '.data.debugCode // empty')
V=$(post /auth/otp/verify "{\"phone\":\"+55649${SUF}79\",\"code\":\"$C\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\",\"device\":{\"deviceId\":\"teste-refresh\",\"platform\":\"ANDROID\"}}")
RT=$(echo "$V" | jq -r '.data.refreshToken // empty'); UID_=$(echo "$V" | jq -r '.data.user.id // empty')
X=$(post /auth/refresh "{\"refreshToken\":\"$RT\"}"); NOVO=$(echo "$X" | jq -r '.data.accessToken // empty')
[ -n "$NOVO" ] && [ "$(echo "$X" | jq -r '.data.user.id')" = "$UID_" ] && [ "$(echo "$X" | jq -r '.data.refreshToken')" != "$RT" ] && ok "Login: acesso vencido e renovado sozinho (refresh)" || falha "Login: renovar o acesso" "$X"
X=$(get /auth/me "$NOVO"); [ "$(echo "$X" | jq -r '.data.id')" = "$UID_" ] && ok "Login: o acesso renovado funciona" || falha "Login: acesso renovado" "$X"
X=$(post /auth/refresh "{\"refreshToken\":\"$RT\"}"); sucesso "$X" && falha "Refresh usado nao deveria valer de novo" "$X" || ok "Seguranca: refresh ja usado nao vale de novo"
CUP="TESTE$SUF$((RANDOM%100))"
X=$(post /admin/coupons "{\"code\":\"$CUP\",\"description\":\"Teste automatico\",\"discountType\":\"FIXED\",\"discountValue\":300,\"maxUses\":5}" "$TA")
sucesso "$X" && ok "Central: cupom $CUP criado (R\$ 3,00)" || falha "Central: criar cupom" "$X"
X=$(get /rides/coupons "$TP"); [ "$(echo "$X" | jq -r --arg c "$CUP" '[.data[] | select(.code==$c)] | length')" = "1" ] && ok "Passageiro: ve o cupom na tela Cupons" || falha "Passageiro: lista de cupons" "$X"
X=$(post /rides/estimate "{\"pickup\":$EMB,\"dropoff\":$DES,\"couponCode\":\"$CUP\"}" "$TP")
[ "$(echo "$X" | jq -r '.data.discountCents')" = "300" ] && ok "Passageiro: estimativa ja mostra o desconto do cupom" || falha "Passageiro: estimativa com cupom" "$X"
# Chamado na hora (09/10/2026): o celular do motorista pergunta e o
# servidor segura a pergunta ate a corrida ser oferecida.
ESPERA=$(mktemp); INI=$(date +%s%N)
( curl -s -m 40 "$API/driver/rides/offers?aguardar=25" -H "Authorization: Bearer $TM" > "$ESPERA"; echo $(( ($(date +%s%N) - INI) / 1000000 )) >> "$ESPERA.ms" ) &
PID_ESPERA=$!
sleep 2
T0=$(date +%s%N)
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"CASH\",\"couponCode\":\"$CUP\"}" "$TP")
MS_PEDIDO=$(( ($(date +%s%N) - T0) / 1000000 ))
RID=$(echo "$X" | jq -r '.data.ride.id // empty')
sucesso "$X" && ok "Passageiro: corrida pedida (resposta em ${MS_PEDIDO} ms)" || falha "Passageiro: pedir corrida" "$X"
wait $PID_ESPERA; MS=$(cat "$ESPERA.ms" 2>/dev/null); MS=$(( ${MS:-99999} - 2000 ))
[ "$(jq -r --arg r "$RID" '[.data[] | select(.rideId==$r)] | length' "$ESPERA" 2>/dev/null)" = "1" ] && [ "${MS:-99999}" -lt 15000 ] 2>/dev/null \
  && ok "Motorista: chamado chegou NA HORA no celular que estava esperando (${MS} ms depois do passageiro tocar em pedir)" || falha "Motorista: chamado na hora (${MS:-?} ms)" "$(head -c 300 "$ESPERA")"
N=0; for t in 1 2 3 4 5; do sleep 3; X=$(get /driver/rides/offers "$TM"); N=$(echo "$X" | jq -r '.data | length' 2>/dev/null); [ "${N:-0}" -ge 1 ] 2>/dev/null && break; done
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Motorista: chamado chegou" || falha "Motorista: chamado chegou" "$X"
[ "$(echo "$X" | jq -r '.data[0].paymentMethodType' 2>/dev/null)" = "CASH" ] && ok "Motorista: chamado mostra a forma de pagamento (CASH)" || falha "Motorista: forma de pagamento no chamado" "$X"
X=$(post "/driver/rides/$RID/accept" '{}' "$TM")
PIN=$(echo "$X" | jq -r '.data.pin // empty')
sucesso "$X" && [ ${#PIN} -eq 4 ] && ok "Motorista: accept (PIN de embarque $PIN vindo do servidor)" || falha "Motorista: accept com PIN" "$X"
X=$(get "/rides/$RID" "$TP")
[ "$(echo "$X" | jq -r '.data.ride.status')" = "DRIVER_ASSIGNED" ] && [ "$(echo "$X" | jq -r '.data.ride.driver.user.name')" = "Motorista Teste Automatico" ] && [ "$(echo "$X" | jq -r '.data.ride.pin')" = "$PIN" ] && [ "$(echo "$X" | jq -r '.data.ride.driverPosition.latitude // empty')" != "" ] \
  && ok "Passageiro: acompanha o aceite de verdade (motorista, PIN e posicao do carro)" || falha "Passageiro: acompanhar a corrida" "$X"
# Chat da corrida (modelo Pop Move): passageiro e motorista conversam enquanto o carro vem.
X=$(post "/rides/$RID/messages" '{"texto":"Estou no portao azul"}' "$TP"); [ "$(echo "$X" | jq -r '.data.minha')" = "true" ] && ok "Chat: passageiro manda mensagem ao motorista" || falha "Chat: passageiro manda mensagem" "$X"
X=$(get /driver/rides/current "$TM"); [ "$(echo "$X" | jq -r '.data.ride.mensagensNaoLidas')" = "1" ] && ok "Chat: o app do motorista sabe que chegou 1 mensagem" || falha "Chat: aviso de mensagem ao motorista" "$X"
X=$(get "/driver/rides/$RID/messages" "$TM"); [ "$(echo "$X" | jq -r '.data.items[0].texto')" = "Estou no portao azul" ] && [ "$(echo "$X" | jq -r '.data.items[0].minha')" = "false" ] && [ "$(echo "$X" | jq -r '.data.podeEscrever')" = "true" ] && ok "Chat: motorista le a mensagem" || falha "Chat: motorista le" "$X"
X=$(post "/driver/rides/$RID/messages" '{"texto":"Chego em 2 minutos"}' "$TM"); [ "$(echo "$X" | jq -r '.data.autor')" = "DRIVER" ] && ok "Chat: motorista responde" || falha "Chat: motorista responde" "$X"
X=$(get "/rides/$RID" "$TP"); [ "$(echo "$X" | jq -r '.data.ride.mensagensNaoLidas')" = "1" ] && [ "$(echo "$X" | jq -r '.data.ride.driver | has("fotoCarroUrl")')" = "true" ] && [ "$(echo "$X" | jq -r '.data.ride.driver.user | has("avatarUrl")')" = "true" ] && [ "$(echo "$X" | jq -r '.data.ride.favorito')" = "false" ] \
  && ok "Passageiro: tela do motorista a caminho com foto, foto do carro, favorito e mensagem nova" || falha "Passageiro: dados do motorista a caminho" "$(echo "$X" | jq -c '{n:.data.ride.mensagensNaoLidas,f:.data.ride.favorito,d:.data.ride.driver}' 2>/dev/null)"
X=$(get "/rides/$RID/messages" "$TP"); [ "$(echo "$X" | jq -r '.data.items | length')" = "2" ] && [ "$(echo "$X" | jq -r '.data.items[0].lida')" = "true" ] && ok "Chat: passageiro ve a conversa e que o motorista leu" || falha "Chat: conversa do passageiro" "$X"
X=$(post "/rides/favoritos/$DID" '{}' "$TP"); [ "$(echo "$X" | jq -r '.data.items[0].driverId')" = "$DID" ] && ok "Passageiro: favoritou o motorista que esta vindo buscar" || falha "Passageiro: favoritar durante a corrida" "$X"
for passo in arriving arrived start; do
  X=$(post "/driver/rides/$RID/$passo" '{"latitude":-18.0126,"longitude":-49.3548}' "$TM")
  sucesso "$X" && ok "Motorista: $passo" || falha "Motorista: $passo" "$X"
done
# Taximetro (Evandro, 08/10/2026: "a contagem do valor na corrida").
X=$(get /driver/rides/current "$TM")
[ "$(echo "$X" | jq -r '.data.ride.tarifa.baseFareCents // empty')" != "" ] && [ "$(echo "$X" | jq -r '.data.ride.cobranca')" != "null" ] \
  && ok "Taximetro: app do motorista recebe a tabela da corrida ($(echo "$X" | jq -r '.data.ride.cobranca'))" || falha "Taximetro: tabela da corrida" "$(echo "$X" | jq -c '.data.ride | {tarifa, cobranca}' 2>/dev/null)"
X=$(post "/driver/rides/$RID/taximetro" '{"distanceMeters":1000}' "$TM")
[ "$(echo "$X" | jq -r '.data.ok')" = "true" ] && ok "Taximetro: motorista manda a medicao ao vivo (1 km)" || falha "Taximetro: medicao ao vivo" "$X"
X=$(get "/rides/$RID" "$TP")
if [ "$(echo "$X" | jq -r '.data.ride.cobranca')" = "TAXIMETRO" ]; then
  [ "$(echo "$X" | jq -r '.data.ride.taximetro.distanceMeters')" = "1000" ] && [ "$(echo "$X" | jq -r '.data.ride.taximetro.valorCents')" -ge 1 ] 2>/dev/null \
    && ok "Passageiro: ve o taximetro correndo ($(echo "$X" | jq -r '.data.ride.taximetro.valorCents') centavos, 1 km)" || falha "Passageiro: taximetro ao vivo" "$(echo "$X" | jq -c '.data.ride.taximetro' 2>/dev/null)"
else
  ok "Passageiro: corrida com preco fechado (sem taximetro ao vivo)"
fi
# Paradas (09/10/2026): o celular informa 5 min parado, mas a viagem do teste
# dura segundos — o servidor nao aceita parada maior que a propria viagem.
X=$(post "/driver/rides/$RID/finish" '{"distanceMeters":1000,"stoppedSeconds":300,"latitude":-18.0126,"longitude":-49.3548}' "$TM")
sucesso "$X" && ok "Motorista: corrida finalizada, valor $(echo "$X" | jq -r '.data.finalFareCents // "?"') centavos" || falha "Motorista: finalizar" "$X"
[ "$(echo "$X" | jq -r '.data.paradasSeconds // empty')" = "0" ] && ok "Taximetro: parada maior que a viagem nao entra na conta (anti-fraude)" || falha "Taximetro: parada impossivel" "$(echo "$X" | jq -c '{paradasSeconds: .data.paradasSeconds, waitingSeconds: .data.waitingSeconds}' 2>/dev/null)"
[ "$(echo "$X" | jq -r '.data.discountCents')" = "300" ] && [ "$(echo "$X" | jq -r '.data.toCollectCents')" = "$(( $(echo "$X" | jq -r '.data.finalFareCents') - 300 ))" ] \
  && ok "Motorista: sabe quanto cobrar com o cupom ($(echo "$X" | jq -r '.data.toCollectCents') centavos)" || falha "Motorista: valor com cupom" "$X"
VAL=$(echo "$X" | jq -r '.data.finalFareCents // 0')
HORA=$((10#$(TZ=America/Sao_Paulo date +%H)))
TAR=$(get /admin/tariffs "$TA")
if [ "$HORA" -ge 6 ] && [ "$HORA" -lt 22 ]; then BAND=diurna; ESP=$(echo "$TAR" | jq -r '.data.diurna.baseFareCents // .data.DIURNA.baseFareCents // 1000'); else BAND=noturna; ESP=$(echo "$TAR" | jq -r '.data.noturna.baseFareCents // .data.NOTURNA.baseFareCents // 2000'); fi
# Taximetro: 1 km fica na franquia; os segundos de viagem entram pelo valor por minuto.
DUR=$(echo "$X" | jq -r '.data.durationSeconds // 0'); PM=$(echo "$TAR" | jq -r ".data.$BAND.perMinuteCents // 0")
ESP=$(awk -v b="$ESP" -v d="$DUR" -v p="$PM" 'BEGIN{printf "%d", b + int(d/60*p + 0.5)}')
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
X=$(post "/rides/$RID/messages" '{"texto":"oi"}' "$TP"); sucesso "$X" && falha "Chat deveria fechar depois da corrida" "$X" || ok "Chat: fecha quando a corrida termina"
X=$(post "/driver/rides/$RID/rate" '{"score":4}' "$TM"); [ "$(echo "$X" | jq -r '.data.score')" = "4" ] && ok "Motorista: avaliou o passageiro com 4 estrelas" || falha "Motorista: avaliar passageiro" "$X"
X=$(get "/driver/rides/history?period=day" "$TM")
[ "$(echo "$X" | jq -r '.data.summary.rides')" -ge 1 ] 2>/dev/null && [ "$(echo "$X" | jq -r '.data.performance.acceptanceRate')" != "null" ] \
  && ok "Motorista: historico de hoje com totais e desempenho (aceitacao $(echo "$X" | jq -r '.data.performance.acceptanceRate')%, taxa $(echo "$X" | jq -r '.data.summary.commissionCents'))" || falha "Motorista: historico com periodo" "$X"
# Relatorio de faturamento em PDF (Evandro, 08/10/2026).
X=$(get "/driver/relatorio?de=$HOJE&ate=$HOJE" "$TM"); CAM=$(echo "$X" | jq -r '.data.caminho // empty')
H=$(curl -s -m 120 "${API%/api}$CAM" | head -c 5)
[ -n "$CAM" ] && [ "$H" = "%PDF-" ] && ok "Motorista: relatorio de faturamento em PDF" || falha "Motorista: relatorio em PDF" "$X $H"
X=$(get "/admin/relatorio?tipo=frota&de=$HOJE&ate=$HOJE" "$TA"); CAM=$(echo "$X" | jq -r '.data.caminho // empty')
H=$(curl -s -m 120 "${API%/api}$CAM" | head -c 5)
[ -n "$CAM" ] && [ "$H" = "%PDF-" ] && ok "Central: relatorio da frota toda em PDF" || falha "Central: relatorio da frota" "$X $H"
X=$(get "/admin/relatorio?tipo=motorista&driverId=$DID&de=$HOJE&ate=$HOJE" "$TA"); CAM=$(echo "$X" | jq -r '.data.caminho // empty')
H=$(curl -s -m 120 "${API%/api}$CAM" | head -c 5)
[ -n "$CAM" ] && [ "$H" = "%PDF-" ] && ok "Central: relatorio de um motorista em PDF" || falha "Central: relatorio do motorista" "$X $H"
C=$(curl -s -o /dev/null -w "%{http_code}" "${API%/api}/api/relatorios/abc.def/x.pdf"); [ "$C" = "403" ] && ok "Seguranca: link de relatorio falso nao abre" || falha "Seguranca: link de relatorio falso" "$C"
X=$(post "/rides/favoritos/$DID" '{}' "$TP"); [ "$(echo "$X" | jq -r '.data.items[0].driverId')" = "$DID" ] && ok "Passageiro: motorista adicionado aos favoritos" || falha "Passageiro: favoritar" "$X"
X=$(post "/rides/bloqueados/$DID" '{}' "$TP"); [ "$(echo "$X" | jq -r '.data.items[0].driverId')" = "$DID" ] && [ "$(get /rides/favoritos "$TP" | jq -r --arg d "$DID" '[.data.items[] | select(.driverId==$d)] | length')" = "0" ] \
  && ok "Passageiro: bloqueou o motorista (sai dos favoritos)" || falha "Passageiro: bloquear motorista" "$X"
X=$(curl -s -m 90 -X DELETE "$API/rides/bloqueados/$DID" -H "Authorization: Bearer $TP"); [ "$(echo "$X" | jq -r '.data.items | length')" = "0" ] && ok "Passageiro: desbloqueou o motorista" || falha "Passageiro: desbloquear" "$X"
post "/rides/favoritos/$DID" '{}' "$TP" >/dev/null
X=$(post /auth/foto "{\"mime\":\"image/jpeg\",\"dados\":\"$FOTO\"}" "$TP"); AV=$(echo "$X" | jq -r '.data.avatarUrl // empty')
C=$(curl -s -o /dev/null -w "%{http_code}" "$API$AV" -H "Authorization: Bearer $TM"); [ -n "$AV" ] && [ "$C" = "200" ] && ok "Passageiro: foto de perfil (o motorista consegue ver)" || falha "Passageiro: foto de perfil" "$X $C"
QUANDO=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"PIX\",\"scheduledFor\":\"$QUANDO\"}" "$TP"); RIDA=$(echo "$X" | jq -r '.data.ride.id // empty')
[ "$(echo "$X" | jq -r '.data.ride.status')" = "SCHEDULED" ] && ok "Passageiro: corrida agendada para daqui a 2 horas" || falha "Passageiro: agendar" "$X"
X=$(get /rides/scheduled "$TP"); [ "$(echo "$X" | jq -r --arg r "$RIDA" '[.data.items[] | select(.id==$r)] | length')" = "1" ] && ok "Passageiro: ve a agendada em Corridas agendadas" || falha "Passageiro: lista de agendadas" "$X"
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"scheduledFor\":\"$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ)\"}" "$TP"); sucesso "$X" && falha "Agendar com menos de 30 min deveria ser recusado" "$X" || ok "Passageiro: agendamento muito em cima da hora recusado"
X=$(post "/rides/$RIDA/cancel" '{"reason":"Teste"}' "$TP"); [ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_PASSENGER" ] && ok "Passageiro: cancelou a agendada" || falha "Passageiro: cancelar agendada" "$X"
# Segunda corrida: o motorista cancela depois de aceitar e o passageiro fica sabendo.
# O app do motorista manda a posicao o tempo todo; aqui o teste manda de novo
# (o servidor so chama quem deu sinal nos ultimos 2 minutos).
post /drivers/me/location '{"latitude":-18.0130,"longitude":-49.3550,"accuracy":10}' "$TM" >/dev/null
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"PIX\"}" "$TP"); RID2=$(echo "$X" | jq -r '.data.ride.id // empty')
N=0; for t in 1 2 3 4 5; do sleep 3; X=$(get /driver/rides/offers "$TM"); N=$(echo "$X" | jq -r '.data | length' 2>/dev/null); [ "${N:-0}" -ge 1 ] 2>/dev/null && break; done
post "/driver/rides/$RID2/accept" '{}' "$TM" >/dev/null
# Evandro (09/10/2026): aceitou pela tela de chamado (app fechado), o "a caminho"
# nao foi e o "Cheguei ao local" dava "Nao e possivel passar de DRIVER_ASSIGNED
# para DRIVER_WAITING". Agora: cheguei direto do aceite, mesmo sem a posicao.
X=$(post "/driver/rides/$RID2/arrived" '{}' "$TM")
[ "$(echo "$X" | jq -r '.data.ride.status // .data.status')" = "DRIVER_WAITING" ] && ok "Motorista: 'Cheguei ao local' direto do aceite (tela de chamado), sem posicao" || falha "Motorista: cheguei direto do aceite" "$X"
X=$(post "/driver/rides/$RID2/cancel" '{"reason":"Pneu furado (teste)"}' "$TM")
[ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_DRIVER" ] && ok "Motorista: cancelou a corrida aceita" || falha "Motorista: cancelar corrida" "$X"
X=$(post "/driver/rides/$RID2/start" '{}' "$TM"); M=$(echo "$X" | jq -r '.error.message // empty')
[ -n "$M" ] && ! echo "$M" | grep -q "DRIVER_\|CANCELLED_\|IN_PROGRESS" && ok "Mensagem de etapa errada em portugues: $M" || falha "Mensagem de etapa errada" "$X"
X=$(get "/rides/$RID2" "$TP"); [ "$(echo "$X" | jq -r '.data.ride.status')" = "CANCELLED_BY_DRIVER" ] && ok "Passageiro: fica sabendo que o motorista cancelou" || falha "Passageiro: ver cancelamento do motorista" "$X"
# Terceira: o passageiro cancela enquanto procura (sem multa).
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"CASH\"}" "$TP"); RID3=$(echo "$X" | jq -r '.data.ride.id // empty')
X=$(post "/rides/$RID3/cancel" '{"reason":"Desisti (teste)"}' "$TP")
[ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_PASSENGER" ] && [ "$(echo "$X" | jq -r '.data.cancellationFeeCents')" = "0" ] && ok "Passageiro: cancelou enquanto procurava, sem taxa" || falha "Passageiro: cancelar" "$X"
X=$(get /rides/current "$TP"); [ "$(echo "$X" | jq -r '.data.ride')" = "null" ] && ok "Passageiro: nenhuma corrida aberta depois de cancelar" || falha "Passageiro: corrida atual" "$X"
X=$(get "/driver/rides/history" "$TM")
[ "$(echo "$X" | jq -r '.data.total' 2>/dev/null)" -ge 1 ] 2>/dev/null && ok "Motorista: historico de corridas com $(echo "$X" | jq -r '.data.total') corrida(s)" || falha "Motorista: historico de corridas" "$X"

# ---- Corrida manual lancada pelo proprio motorista (Evandro, 09/10/2026) ----
X=$(post /driver/manual-rides/buscar-passageiro "{\"contato\":\"+55649${SUF}71\"}" "$TM")
[ "$(echo "$X" | jq -r '.data.encontrado')" = "true" ] && [ "$(echo "$X" | jq -r '.data | (has("phone") or has("email"))')" = "false" ] && ok "Motorista: corrida manual acha o passageiro pelo telefone e mostra so o primeiro nome ($(echo "$X" | jq -r '.data.primeiroNome'))" || falha "Motorista: buscar passageiro da corrida manual" "$X"
X=$(post /driver/manual-rides "{\"contato\":\"+55649${SUF}71\",\"pickup\":$EMB}" "$TM"); RIDM=$(echo "$X" | jq -r '.data.rideId // empty')
Y=$(get "/rides/$RIDM" "$TP")
[ -n "$RIDM" ] && [ "$(echo "$Y" | jq -r '.data.ride.status')" = "DRIVER_WAITING" ] && ok "Motorista: corrida manual aberta no nome do passageiro, ja no local (o passageiro ve no app)" || falha "Motorista: corrida manual com conta" "$X $Y"
X=$(post "/driver/rides/$RIDM/cancel" '{"reason":"Teste da corrida manual"}' "$TM")
[ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_DRIVER" ] && ok "Motorista: cancelou a corrida manual de teste" || falha "Motorista: cancelar corrida manual" "$X"
X=$(post /driver/manual-rides "{\"contato\":\"+55649${SUF}79\",\"pickup\":$EMB}" "$TM")
echo "$X" | jq -r '.error.message // empty' | grep -qi "nome" && ok "Motorista: corrida manual de quem nao tem conta pede o nome" || falha "Motorista: corrida manual sem nome" "$X"
X=$(post /driver/manual-rides "{\"contato\":\"+55649${SUF}79\",\"passengerName\":\"Passageiro Rua Teste\",\"pickup\":$EMB}" "$TM"); RIDN=$(echo "$X" | jq -r '.data.rideId // empty')
[ -n "$RIDN" ] && [ "$(echo "$X" | jq -r '.data.passageiroTinhaConta')" = "false" ] && ok "Motorista: corrida manual de passageiro sem conta (fica pelo telefone)" || falha "Motorista: corrida manual sem conta" "$X"
[ -n "$RIDN" ] && post "/driver/rides/$RIDN/cancel" '{"reason":"Teste da corrida manual"}' "$TM" >/dev/null

# ---- Entrar pelo e-mail (conta nova) e o mesmo telefone virar motorista ----
EM2="passageiro2.${SUF}$((RANDOM%1000))@teste.fortalezamov.com.br"
P=$(pedir_codigo "{\"email\":\"$EM2\",\"purpose\":\"LOGIN\"}")
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

# ================= Carteira pre-paga / Recargas =================
X=$(get /admin/wallets "$TA")
[ "$(echo "$X" | jq -r --arg d "$DID" '[.data.items[] | select(.driverId==$d)] | length')" = "1" ] && ok "Central: aba Carteiras lista o motorista com o saldo" || falha "Central: lista de carteiras" "$X"
SALDO=$(get "/admin/drivers/$DID/wallet" "$TA" | jq -r '.data.balanceCents')
X=$(post "/admin/drivers/$DID/wallet/credit" '{"amountCents":100,"operation":"DEBIT","description":"Ajuste de teste"}' "$TA")
[ "$(echo "$X" | jq -r '.data.balanceCents')" = "$((SALDO - 100))" ] && [ "$(echo "$X" | jq -r '.data.transactions[0].kind')" = "DEBIT" ] && [ "$(echo "$X" | jq -r '.data.transactions[0].balanceAfterCents')" = "$((SALDO - 100))" ] \
  && ok "Central: remover saldo (-R\$ 1,00) com extrato e saldo restante" || falha "Central: remover saldo" "$X"
X=$(get /driver/wallet/resumo "$TM"); [ "$(echo "$X" | jq -r '.data.last.kind')" = "DEBIT" ] && [ "$(echo "$X" | jq -r '.data.blocking')" = "false" ] && ok "Motorista: o aplicativo recebe o saldo novo e o ultimo lancamento" || falha "Motorista: resumo da carteira" "$X"
X=$(post "/admin/drivers/$DID/wallet/credit" "{\"amountCents\":$((SALDO - 100)),\"operation\":\"DEBIT\",\"description\":\"Zerar para teste\"}" "$TA")
X=$(get /driver/wallet/resumo "$TM"); [ "$(echo "$X" | jq -r '.data.balanceCents')" = "0" ] && [ "$(echo "$X" | jq -r '.data.blocking')" = "false" ] && ok "Carteira: saldo zerado avisa mas nao corta o turno" || falha "Carteira: saldo zerado" "$X"
post /drivers/me/location '{"latitude":-18.0130,"longitude":-49.3550,"accuracy":10}' "$TM" >/dev/null
X=$(post /rides "{\"pickup\":$EMB,\"dropoff\":$DES,\"paymentMethodType\":\"CASH\"}" "$TP"); RSS=$(echo "$X" | jq -r '.data.ride.id // empty')
X=$(get /driver/rides/offers "$TM")
[ -n "$RSS" ] && [ "$(echo "$X" | jq -r --arg r "$RSS" '[.data[] | select(.rideId==$r)] | length')" = "1" ] && ok "Carteira: motorista ja online e sem saldo continua recebendo chamado" || falha "Carteira: chamado sem saldo" "$X"
O=$(echo "$X" | jq -c --arg r "$RSS" '[.data[] | select(.rideId==$r)][0]')
[ "$(echo "$O" | jq -r '.driverNetCents')" -gt 0 ] 2>/dev/null && [ "$(echo "$O" | jq -r '.passengerRating')" != "null" ] && [ "$(echo "$O" | jq -r '.commissionPercent')" = "8" ] \
  && ok "Motorista: chamado mostra valor liquido ($(echo "$O" | jq -r '.driverNetCents')), taxa 8% e nota do passageiro ($(echo "$O" | jq -r '.passengerRating'))" || falha "Motorista: dados do chamado" "$O"
post "/rides/$RSS/cancel" '{"reason":"Teste"}' "$TP" >/dev/null
patch /drivers/me/online '{"isOnline":false}' "$TM" >/dev/null
X=$(patch /drivers/me/online '{"isOnline":true}' "$TM"); sucesso "$X" && falha "Sem saldo nao deveria ficar online de novo" "$X" || ok "Carteira: sem saldo nao consegue ficar online de novo"
X=$(post "/admin/drivers/$DID/wallet/credit" '{"amountCents":5000,"operation":"CREDIT","description":"Recarga PIX comprovante teste"}' "$TA")
X=$(get /driver/wallet/resumo "$TM"); [ "$(echo "$X" | jq -r '.data.last.kind')" = "CREDIT" ] && [ "$(echo "$X" | jq -r '.data.last.amountCents')" = "5000" ] && ok "Carteira: o aplicativo fica sabendo da recarga (+R\$ 50,00)" || falha "Carteira: recarga no aplicativo" "$X"
X=$(patch /drivers/me/online '{"isOnline":true}' "$TM"); sucesso "$X" && ok "Carteira: com a recarga, ficou online de novo" || falha "Carteira: online depois da recarga" "$X"

# ================= Painel da Central =================
X=$(get /admin/overview "$TA")
sucesso "$X" && [ "$(echo "$X" | jq -r '.data.driversOnline')" -ge 1 ] 2>/dev/null \
  && ok "Central: visao geral (ativas $(echo "$X" | jq -r '.data.activeRides'), concluidas hoje $(echo "$X" | jq -r '.data.completedToday'), online $(echo "$X" | jq -r '.data.driversOnline'), faturamento $(echo "$X" | jq -r '.data.revenueTodayCents'))" \
  || falha "Central: visao geral" "$X"
# Ganho da Central (09/10/2026): comissao + mensalidades, separado do total das corridas.
GC=$(echo "$X" | jq -r '.data.centralRevenueTodayCents'); CO=$(echo "$X" | jq -r '.data.commissionTodayCents'); ME=$(echo "$X" | jq -r '.data.monthlyFeesTodayCents')
[ "$GC" != "null" ] && [ "$GC" -eq $((CO + ME)) ] 2>/dev/null \
  && ok "Central: ganho da Central hoje = comissao ($CO) + mensalidades ($ME) = $GC (total das corridas: $(echo "$X" | jq -r '.data.revenueTodayCents'))" \
  || falha "Central: ganho da Central hoje" "$X"
X=$(get "/admin/reports/finance?days=1" "$TA")
[ "$(echo "$X" | jq -r '.data.centralRevenueCents')" = "$(echo "$X" | jq -r '(.data.commissionCents + .data.monthlyFeesCents)')" ] 2>/dev/null \
  && ok "Central: relatorio financeiro com o ganho da Central ($(echo "$X" | jq -r '.data.centralRevenueCents'))" \
  || falha "Central: ganho da Central no relatorio" "$X"
X=$(get /admin/tariffs "$TA")
[ "$(echo "$X" | jq -r '.data.categorias | length')" -ge 1 ] 2>/dev/null && ok "Central: tarifas por categoria ($(echo "$X" | jq -r '[.data.categorias[].nome] | join(", ")'))" || falha "Central: tarifas por categoria" "$X"
CARRO=$(echo "$X" | jq -c '.data.categorias[] | select(.codigo=="CARRO") | {nome, ativa, diurna: (.diurna | del(.flag, .updatedAt)), noturna: (.noturna | del(.flag, .updatedAt))}')
MULT=$(echo "$X" | jq -c '.data.multiplicador')
X=$(put /admin/tariffs/categoria/CARRO "$CARRO" "$TA"); sucesso "$X" && ok "Central: salvou a categoria Carro (antes dava 'Metodo PUT nao suportado')" || falha "Central: salvar categoria" "$X"
X=$(put /admin/tariffs/multiplicador "$MULT" "$TA"); sucesso "$X" && ok "Central: multiplicador dinamico salvo ($(echo "$MULT" | jq -r '.cidade')x)" || falha "Central: multiplicador" "$X"
X=$(patch "/admin/drivers/$DID/finance" '{"financeModel":"TAXA_FIXA","fixedFeeCents":200}' "$TA")
[ "$(echo "$X" | jq -r '.data.financeModel')" = "TAXA_FIXA" ] && ok "Central: modelo financeiro do motorista (taxa fixa R\$ 2,00)" || falha "Central: modelo financeiro" "$X"
patch "/admin/drivers/$DID/finance" '{"financeModel":"PADRAO"}' "$TA" >/dev/null
X=$(patch "/admin/drivers/$DID/category" '{"category":"CARRO"}' "$TA"); sucesso "$X" && ok "Central: categoria do veiculo do motorista" || falha "Central: categoria do veiculo" "$X"
FONE_P=$(get /auth/me "$TP" | jq -r '.data.phone')
X=$(post /admin/rides "{\"passengerName\":\"Passageiro Teste\",\"passengerPhone\":\"$FONE_P\",\"pickup\":$EMB,\"dropoff\":$DES,\"category\":\"CARRO\",\"paymentMethodType\":\"CASH\"}" "$TA")
RMAN=$(echo "$X" | jq -r '.data.rideId // empty')
[ -n "$RMAN" ] && ok "Central: corrida manual criada (pedido por telefone)" || falha "Central: corrida manual" "$X"
X=$(get "/admin/dispatch/drivers?lat=-18.0125&lng=-49.3547" "$TA")
[ "$(echo "$X" | jq -r --arg d "$DID" '[.data[] | select(.driverId==$d and .latitude != null)] | length')" = "1" ] && ok "Central: motoristas livres por distancia, com posicao no mapa" || falha "Central: motoristas livres" "$X"
X=$(post "/admin/rides/$RMAN/assign" "{\"driverId\":\"$DID\"}" "$TA"); sucesso "$X" && ok "Central: corrida enviada para motorista especifico" || falha "Central: atribuir" "$X"
X=$(get /driver/rides/offers "$TM")
[ "$(echo "$X" | jq -r --arg r "$RMAN" '[.data[] | select((.rideId // .ride.id // .id)==$r)] | length')" -ge 1 ] 2>/dev/null && ok "Motorista: recebeu o chamado enviado pela Central" || falha "Motorista: chamado da Central" "$X"
X=$(post "/admin/rides/$RMAN/cancel" '{"reason":"Teste automatico"}' "$TA")
[ "$(echo "$X" | jq -r '.data.status')" = "CANCELLED_BY_SYSTEM" ] && ok "Central: cancelou a corrida" || falha "Central: cancelar corrida" "$X"
post "/admin/drivers/$DID/wallet/credit" '{"amountCents":500,"description":"Teste automatico"}' "$TA" >/dev/null
X=$(post /driver/payouts '{"amountCents":100,"pixKey":"teste@exemplo.com"}' "$TM"); PID_=$(echo "$X" | jq -r '.data.id // empty')
[ -n "$PID_" ] && ok "Motorista: pediu saque PIX de R\$ 1,00" || falha "Motorista: pedir saque" "$X"
X=$(get "/admin/payouts?status=REQUESTED" "$TA"); [ "$(echo "$X" | jq -r --arg p "$PID_" '[.data.items[] | select(.id==$p)] | length')" = "1" ] && ok "Central: ve o pedido de saque com a chave PIX" || falha "Central: lista de saques" "$X"
X=$(patch "/admin/payouts/$PID_" '{"paid":true}' "$TA"); [ "$(echo "$X" | jq -r '.data.status')" = "PAID" ] && ok "Central: confirmou o PIX (descontado da carteira)" || falha "Central: confirmar saque" "$X"
X=$(get "/admin/reports/finance?days=1" "$TA"); sucesso "$X" && ok "Central: relatorio de receitas (dinheiro $(echo "$X" | jq -r '.data.cashCents'), PIX/app $(echo "$X" | jq -r '.data.pixAndAppCents'), comissao $(echo "$X" | jq -r '.data.commissionCents'))" || falha "Central: relatorio financeiro" "$X"
# Contatos de emergencia do passageiro (aparecem para a Central no SOS).
X=$(curl -s -m 90 -X PUT "$API/users/me/contatos-emergencia" -H 'Content-Type: application/json' -H "Authorization: Bearer $TP" -d '{"contatos":[{"nome":"Maria (irma)","telefone":"(64) 99999-1234"}]}')
[ "$(echo "$X" | jq -r '.data.items[0].telefone')" = "+5564999991234" ] && ok "Passageiro: contato de emergencia gravado" || falha "Passageiro: gravar contato de emergencia" "$X"
X=$(curl -s -m 90 -X PUT "$API/users/me/contatos-emergencia" -H 'Content-Type: application/json' -H "Authorization: Bearer $TP" -d '{"contatos":[{"nome":"X","telefone":"123"}]}')
sucesso "$X" && falha "Telefone invalido deveria ser recusado" "$X" || ok "Passageiro: contato com telefone invalido recusado"
X=$(get /users/me/contatos-emergencia "$TP"); [ "$(echo "$X" | jq -r '.data.items | length')" = "1" ] && ok "Passageiro: ve os contatos de emergencia" || falha "Passageiro: ler contatos" "$X"
X=$(post /safety/sos '{"latitude":-18.0125,"longitude":-49.3547}' "$TP"); SOS=$(echo "$X" | jq -r '.data.id // empty')
[ -n "$SOS" ] && ok "Passageiro: SOS acionado" || falha "SOS: acionar" "$X"
post "/safety/sos/$SOS/location" '{"latitude":-18.0130,"longitude":-49.3550}' "$TP" >/dev/null
X=$(get /admin/safety "$TA"); [ "$(echo "$X" | jq -r --arg s "$SOS" '[.data.items[] | select(.id==$s and .latitude < -18.0128)] | length')" = "1" ] && ok "Central: alerta de SOS com a posicao atualizada" || falha "Central: alerta de SOS" "$X"
[ "$(echo "$X" | jq -r --arg s "$SOS" '.data.items[] | select(.id==$s) | .emergencyContacts[0].phone')" = "+5564999991234" ] && ok "Central: alerta de SOS mostra o contato de emergencia" || falha "Central: contato no SOS" "$(echo "$X" | jq -c --arg s "$SOS" '.data.items[] | select(.id==$s)')"
X=$(patch "/admin/safety/$SOS/resolve" '{"note":"Teste automatico"}' "$TA"); sucesso "$X" && ok "Central: SOS encerrado" || falha "Central: encerrar SOS" "$X"
PIDP=$(get /auth/me "$TP" | jq -r '.data.id')
X=$(get "/admin/passengers?search=$(echo "$FONE_P" | tr -dc 0-9 | tail -c 8)" "$TA"); [ "$(echo "$X" | jq -r --arg p "$PIDP" '[.data.items[] | select(.id==$p)] | length')" = "1" ] && ok "Central: busca de passageiro pelo telefone" || falha "Central: busca de passageiro" "$X"
X=$(patch "/admin/passengers/$PIDP/block" '{"blocked":true,"reason":"Teste automatico de bloqueio"}' "$TA"); [ "$(echo "$X" | jq -r '.data.status')" = "BLOCKED" ] && ok "Central: passageiro bloqueado com motivo" || falha "Central: bloquear passageiro" "$X"
X=$(patch "/admin/passengers/$PIDP/block" '{"blocked":false,"reason":"Fim do teste"}' "$TA"); [ "$(echo "$X" | jq -r '.data.history | length')" -ge 2 ] 2>/dev/null && ok "Central: desbloqueado, historico com $(echo "$X" | jq -r '.data.history | length') registros" || falha "Central: historico de bloqueio" "$X"

patch /drivers/me/online '{"isOnline":false}' "$TM" >/dev/null
# Mapa da Central: motorista offline continua no mapa (cinza), na ultima posicao.
X=$(get "/admin/dispatch/drivers?lat=-18.0125&lng=-49.3547&todos=1" "$TA")
[ "$(echo "$X" | jq -r --arg d "$DID" '[.data[] | select(.driverId==$d and .online==false and .latitude != null)] | length')" = "1" ] && ok "Central: motorista offline continua no mapa (cinza, ultima posicao)" || falha "Central: motorista offline no mapa" "$(echo "$X" | jq -c --arg d "$DID" '[.data[] | select(.driverId==$d)]')"
X=$(get "/admin/dispatch/drivers?lat=-18.0125&lng=-49.3547" "$TA")
[ "$(echo "$X" | jq -r --arg d "$DID" '[.data[] | select(.driverId==$d)] | length')" = "0" ] && ok "Despacho: so motoristas online" || falha "Despacho: offline na lista" "$X"
post "/rides/$RID/cancel" '{"reason":"Teste automatico"}' "$TP" >/dev/null
# Limpeza pela opcao "Excluir" da Central (Evandro, 08/10/2026): os
# motoristas de teste nao ficam mais acumulando na lista.
IDS=$(for i in $DID $DIDC $DIDV $DIDW; do printf '"%s",' "$i"; done | sed 's/,$//'); NIDS=$(echo $DID $DIDC $DIDV $DIDW | wc -w)
X=$(post /admin/drivers/excluir "{\"ids\":[$IDS]}" "$TA")
[ "$(echo "$X" | jq -r '.data.excluidos')" = "$NIDS" ] && ok "Central: excluiu $NIDS motoristas de teste ($(echo "$X" | jq -r '[.data.itens[].resultado] | join(", ")'))" || falha "Central: excluir motoristas" "$X"
X=$(get "/admin/drivers/$DIDC" "$TA"); sucesso "$X" && falha "Motorista excluido ainda existe" "$X" || ok "Central: motorista excluido sumiu"
X=$(get "/rides/history?page=1&pageSize=5" "$TP"); sucesso "$X" && ok "Passageiro: historico de corridas continua depois de excluir o motorista" || falha "Passageiro: historico sem o motorista" "$X"
X=$(get /auth/me "$TPV"); [ "$(echo "$X" | jq -r '.data.role')" = "PASSENGER" ] && [ "$(echo "$X" | jq -r '.data.driverId')" = "null" ] && ok "Quem tambem e passageiro continua com a conta de passageiro" || falha "Conta de passageiro depois de excluir o motorista" "$X"
CID_=$(get /admin/coupons "$TA" | jq -r --arg c "$CUP" '.data.items[] | select(.code==$c) | .id'); [ -n "$CID_" ] && patch "/admin/coupons/$CID_" '{"isActive":false}' "$TA" >/dev/null
# Limpeza: o teste apaga o que criou (contas de teste, corridas, cupons) e a
# conta de operador, para nada de teste ficar no financeiro da Central.
if [ -n "${OPID:-}" ]; then
  X=$(curl -s -m 90 -X DELETE "$API/admin/equipe/$OPID" -H "Authorization: Bearer $TA"); sucesso "$X" && ok "Central: apagou a conta do operador de teste" || falha "Central: apagar operador" "$X"
fi
X=$(post /admin/limpeza/teste '{}' "$TA"); N=$(echo "$X" | jq -r '.data.contas // 0')
[ "${N:-0}" -ge 1 ] 2>/dev/null && ok "Limpeza: apagou as $N contas deste teste e $(echo "$X" | jq -r '.data.corridas') corridas delas" || falha "Limpeza dos dados do teste" "$X"
echo | tee -a "$REL"; echo "Resultado: $FALHAS falha(s)." | tee -a "$REL"
exit $FALHAS
