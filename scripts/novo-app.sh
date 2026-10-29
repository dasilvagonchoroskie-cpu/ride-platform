#!/usr/bin/env bash
# App de outro operador (etapa 6, Evandro 29/10/2026): mesmo codigo, com o
# nome, a cor, os icones e o pacote (Google Play) do operador.
#
# Uso:
#   bash scripts/novo-app.sh --operador goiatuba --nome "Goiatuba Mov" --cor "#12AB34" \
#        --pacote br.com.goiatubamov [--api https://servidor-do-operador.onrender.com] \
#        [--icone-passageiro simbolo.png] [--icone-motorista simbolo.png] [--fundo "#0070B8"] [--enviar]
#
# Cria operadores/<operador>/app.env (+ os simbolos). Com --enviar, grava no
# GitHub e roda a esteira "App de operador", que compila os APKs do
# passageiro e do motorista desse operador.
#
# O que NAO da para fazer sozinho (fica com o dono do app novo):
# - aviso push: registrar <pacote>.passageiro e <pacote>.motorista no Firebase;
# - Google Play: conta de desenvolvedor e ficha da loja do operador.
set -euo pipefail
cd "$(dirname "$0")/.."

OPERADOR=""; NOME=""; COR="#1E5BB8"; PACOTE=""; API="https://fortaleza-mov-backend.onrender.com"
ICONE_P=""; ICONE_M=""; FUNDO="#0070B8"; ENVIAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --operador) OPERADOR="$2"; shift 2 ;;
    --nome) NOME="$2"; shift 2 ;;
    --cor) COR="$2"; shift 2 ;;
    --pacote) PACOTE="$2"; shift 2 ;;
    --api) API="$2"; shift 2 ;;
    --icone-passageiro) ICONE_P="$2"; shift 2 ;;
    --icone-motorista) ICONE_M="$2"; shift 2 ;;
    --fundo) FUNDO="$2"; shift 2 ;;
    --enviar) ENVIAR=1; shift ;;
    *) echo "Opcao desconhecida: $1"; exit 2 ;;
  esac
done

erro() { echo "ERRO: $1" >&2; exit 2; }
[[ "$OPERADOR" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || erro "--operador: letras minusculas, numeros e hifen (ex.: goiatuba)"
[ ${#NOME} -ge 2 ] && [ ${#NOME} -le 30 ] || erro "--nome: de 2 a 30 letras"
[[ "$COR" =~ ^#[0-9A-Fa-f]{6}$ ]] || erro "--cor: formato #RRGGBB"
[[ "$FUNDO" =~ ^#[0-9A-Fa-f]{6}$ ]] || erro "--fundo: formato #RRGGBB"
[[ "$PACOTE" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]] || erro "--pacote: ex.: br.com.goiatubamov (minusculas, com pontos)"
[ "$PACOTE" != "br.com.fortalezamov" ] || erro "--pacote: esse e o da Fortaleza Mov; o operador precisa de um proprio"
[[ "$API" =~ ^https://[A-Za-z0-9.-]+(/.*)?$ ]] || erro "--api: endereco https do servidor"
case "$NOME" in *'"'*|*'$'*|*'`'*|*'\'*) erro "--nome: sem aspas, \$, crase ou barra invertida" ;; esac

DIR="operadores/$OPERADOR"
mkdir -p "$DIR"
cat > "$DIR/app.env" <<FIM
# App do operador "$OPERADOR" (gerado por scripts/novo-app.sh em $(date +%Y-%m-%d)).
# Lido pela esteira "App de operador" (.github/workflows/app-operador.yml).
MARCA_NOME="$NOME"
MARCA_COR="$COR"
ICONE_FUNDO="$FUNDO"
ID_PASSAGEIRO="$PACOTE.passageiro"
ID_MOTORISTA="$PACOTE.motorista"
API_URL="$API"
FIM
for par in "passageiro:$ICONE_P" "motorista:$ICONE_M"; do
  papel="${par%%:*}"; arq="${par#*:}"
  [ -n "$arq" ] || continue
  [ -f "$arq" ] || erro "icone nao encontrado: $arq"
  python3 -I -c "import sys; from PIL import Image; im=Image.open(sys.argv[1]); im.verify(); sys.exit(0 if im.format=='PNG' else 3)" "$arq" \
    || erro "o icone precisa ser PNG (de preferencia com fundo transparente): $arq"
  cp "$arq" "$DIR/icone-$papel.png"
done
echo "Pronto: $DIR/app.env"
cat "$DIR/app.env"

if [ "$ENVIAR" = 1 ]; then
  git add "$DIR"
  git commit -q -m "App do operador $OPERADOR ($NOME)" || true
  for t in 1 2 3; do git pull -q --rebase origin main && git push -q origin HEAD:main && break; sleep 3; done
  REPO="$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')"
  gh api -X POST "repos/$REPO/actions/workflows/app-operador.yml/dispatches" -f ref=main -f "inputs[operador]=$OPERADOR" \
    && echo "Esteira \"App de operador\" iniciada para $OPERADOR."
fi
