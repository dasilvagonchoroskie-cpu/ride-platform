#!/usr/bin/env bash
# Contas de teste para a esteira "Medir o mapa" (etapa 2, 29/10/2026).
#
#   medir-contas.sh preparar <app> <pasta>   cria as contas e grava a sessao
#                                            do app em <pasta>/semente.b64
#   medir-contas.sh manter <pasta>           mantem o motorista de teste
#                                            "disponivel" (posicao a cada 45 s)
#   medir-contas.sh apagar <pasta>           apaga SO as contas criadas aqui
#
# Os nomes e e-mails sao os do teste automatico (a Central reconhece como
# teste). Nenhum token e impresso: tudo fica em arquivos dentro de <pasta>.
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"
CHAVE="${OTP_CHAVE_TESTE:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
EMB_LAT=-18.0125
EMB_LNG=-49.3547

post()  { curl -s -m 90 -X POST "$API$1" -H 'Content-Type: application/json' ${CHAVE:+-H "x-chave-teste: $CHAVE"} ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
patch() { curl -s -m 90 -X PATCH "$API$1" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
get()   { curl -s -m 90 "$API$1" ${2:+-H "Authorization: Bearer $2"}; }
mascarar() { [ -n "$1" ] && echo "::add-mask::$1"; }

codigo() {  # pede o codigo (5 por minuto por IP: espera e tenta de novo)
  local r t
  for t in 1 2 3 4 5; do
    r=$(post /auth/otp/request "$1")
    echo "$r" | jq -e '.data.debugCode' >/dev/null 2>&1 && { echo "$r" | jq -r '.data.debugCode'; return; }
    sleep 20
  done
}

entrar_admin() {
  local c v
  c=$(codigo "{\"email\":\"$ADMIN_EMAIL\",\"purpose\":\"LOGIN\"}")
  v=$(post /auth/otp/verify "{\"email\":\"$ADMIN_EMAIL\",\"code\":\"${c:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"PASSENGER\"}")
  TA=$(echo "$v" | jq -r '.data.accessToken // empty'); RA=$(echo "$v" | jq -r '.data.refreshToken // empty')
  mascarar "$TA"; mascarar "$RA"
  [ -n "$TA" ] || { echo "Falhou o login da Central"; exit 1; }
  echo "$v" | jq -c '.data.user | {id, name, email, role}' > "$PASTA/admin.json"
  echo "TA='$TA'" >> "$PASTA/estado.env"
}

entrar_fone() {  # $1 telefone, $2 papel -> TOKEN, REFRESH
  local c v
  c=$(codigo "{\"phone\":\"$1\",\"purpose\":\"LOGIN\"}")
  v=$(post /auth/otp/verify "{\"phone\":\"$1\",\"code\":\"${c:-000000}\",\"purpose\":\"LOGIN\",\"role\":\"$2\",\"device\":{\"deviceId\":\"medir-mapa\",\"platform\":\"ANDROID\"}}")
  TOKEN=$(echo "$v" | jq -r '.data.accessToken // empty'); REFRESH=$(echo "$v" | jq -r '.data.refreshToken // empty')
  mascarar "$TOKEN"; mascarar "$REFRESH"
}

cpf() { python3 -c "
import random
n=[random.randint(0,9) for _ in range(9)]
for k in (10,11):
    s=sum(d*(k-i) for i,d in enumerate(n)); r=(s*10)%11; n.append(0 if r==10 else r)
print(''.join(map(str,n)))"; }

criar_motorista() {  # motorista aprovado pela Central, com carro e saldo
  local suf="$1" fone corpo x
  fone="+55649${suf}82"
  MCPF=$(cpf); MCNH=$(python3 -c "import random;print(''.join(str(random.randint(0,9)) for _ in range(11)))")
  corpo="{\"name\":\"Motorista Pela Central\",\"phone\":\"(64) 9${suf}82\",\"cpf\":\"$MCPF\",\"birthDate\":\"1985-07-20\",\"cnhNumber\":\"$MCNH\",\"cnhCategory\":\"B\",\"cnhExpiresAt\":\"2032-05-01\",\"vehicle\":{\"plate\":\"TSM$(printf '%04d' $((RANDOM%10000)))\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2021,\"color\":\"Branco\"},\"aprovar\":true}"
  x=$(post /admin/drivers "$corpo" "$TA"); DID=$(echo "$x" | jq -r '.data.id // empty')
  [ -n "$DID" ] || { echo "Falhou criar o motorista: $(echo "$x" | jq -c '.error' | head -c 200)"; exit 1; }
  entrar_fone "$fone" DRIVER; TM="$TOKEN"; RM="$REFRESH"
  post /auth/accept-terms '{"version":"1.0.0"}' "$TM" >/dev/null
  echo "$(get /auth/me "$TM" | jq -r '.data.id')" >> "$PASTA/contas.txt"
  post "/admin/drivers/$DID/wallet/credit" '{"amountCents":2000,"operation":"CREDIT","description":"Saldo do teste de medicao do mapa"}' "$TA" >/dev/null
  MFONE="$fone"
  echo "TM='$TM'" >> "$PASTA/estado.env"
}

motorista_disponivel() {
  patch /drivers/me/online '{"isOnline":true}' "$TM" >/dev/null
  post /drivers/me/location "{\"latitude\":-18.0131,\"longitude\":-49.3552,\"accuracy\":10}" "$TM" >/dev/null
}

semente() {  # JSON {chave: valor} -> base64 numa linha
  python3 -c "import base64,json,sys;print(base64.b64encode(json.dumps(json.load(sys.stdin)).encode()).decode())"
}

case "${1:-}" in
  preparar)
    APP="$2"; PASTA="$3"; mkdir -p "$PASTA"; : > "$PASTA/contas.txt"; : > "$PASTA/estado.env"
    SUF=$(date +%H%M%S)
    entrar_admin
    case "$APP" in
      mobile_passenger)
        criar_motorista "$SUF"; motorista_disponivel
        entrar_fone "+55649${SUF}81" PASSENGER; TP="$TOKEN"; RP="$REFRESH"
        post /auth/accept-terms '{"version":"1.0.0"}' "$TP" >/dev/null
        CID=$(get /app/config | jq -r '.data.cidades[0] // empty')
        post /auth/cadastro "{\"name\":\"Passageiro Teste Automatico\",\"email\":\"medida.${SUF}@teste.fortalezamov.com.br\",\"gender\":\"NAO_INFORMAR\",\"cpf\":\"$(cpf)\",\"password\":\"Teste1234\"${CID:+,\"city\":\"$CID\"}}" "$TP" >/dev/null
        ME=$(get /auth/me "$TP" | jq -c '.data'); echo "$ME" | jq -r '.id' >> "$PASTA/contas.txt"
        [ "$(echo "$ME" | jq -r '.cadastroCompleto')" = "true" ] || { echo "Cadastro do passageiro nao completou"; exit 1; }
        jq -n --arg t "$TP" --arg r "$RP" --arg u "$ME" \
          '{"ride.accessToken":$t,"ride.refreshToken":$r,"ride.user":$u,"autorizacoes.vistas":"1"}' | semente > "$PASTA/semente.b64"
        ;;
      mobile_driver)
        criar_motorista "$SUF"
        PERFIL=$(jq -nc --arg id "$DID" --arg f "$MFONE" --arg cpf "$MCPF" --arg cnh "$MCNH" \
          '{id:$id,name:"Motorista Pela Central",phone:$f,cpf:$cpf,cnhNumber:$cnh,cnhCategory:"B",cnhExpiresAt:"2032-05-01",approval:"approved",isOnline:false,termsAccepted:true}')
        jq -n --arg t "$TM" --arg r "$RM" --arg p "$PERFIL" \
          '{"ride.accessToken":$t,"ride.refreshToken":$r,"ride.driverProfile":$p,"autorizacoes.vistas":"1"}' | semente > "$PASTA/semente.b64"
        ;;
      central_app)
        criar_motorista "$SUF"; motorista_disponivel
        jq -n --arg t "$TA" --arg r "$RA" --arg u "$(cat "$PASTA/admin.json")" \
          '{"ride.accessToken":$t,"ride.refreshToken":$r,"ride.adminUser":$u,"autorizacoes.vistas":"1"}' | semente > "$PASTA/semente.b64"
        ;;
    esac
    echo "Contas prontas para $APP ($(wc -l < "$PASTA/contas.txt") conta(s) de teste)."
    ;;
  manter)
    PASTA="$2"; . "$PASTA/estado.env"
    [ -n "${TM:-}" ] || exit 0
    while true; do motorista_disponivel; sleep 45; done
    ;;
  apagar)
    PASTA="$2"; . "$PASTA/estado.env" 2>/dev/null || true
    [ -n "${TM:-}" ] && patch /drivers/me/online '{"isOnline":false}' "$TM" >/dev/null
    # A esteira roda na mesma fila do teste de ponta a ponta (nunca juntos):
    # a limpeza do teste apaga todas as contas com marca de teste.
    if [ -n "${TA:-}" ]; then
      X=$(post /admin/limpeza/teste '{}' "$TA")
      echo "Limpeza das contas de teste: $(echo "$X" | jq -c '{contas: .data.contas, corridas: .data.corridas, erro: .error.message}' | head -c 300)"
    fi
    ;;
  *) echo "uso: $0 preparar|manter|apagar ..."; exit 2 ;;
esac
