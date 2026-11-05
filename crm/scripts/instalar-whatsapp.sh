#!/usr/bin/env bash
# Instala a biblioteca do WhatsApp (Baileys) em data/wa-lib. Roda de qualquer pasta, no Termux ou no Debian.
# A biblioteca fica fora do node_modules do CRM: sobrevive a atualizações e o CRM funciona normalmente sem ela.
# ATENÇÃO: o pareamento por "Dispositivos conectados" é um método NÃO oficial; o WhatsApp pode bloquear o número.
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$APP/data/wa-lib"

echo "==> Preparando $LIB"
mkdir -p "$LIB"
cd "$LIB"
[ -f package.json ] || echo '{"name":"wa-lib","version":"1.0.0","private":true}' > package.json

# Algumas dependências da biblioteca podem vir direto do GitHub: precisam do git.
if ! command -v git >/dev/null 2>&1; then
  echo "==> Instalando o git"
  if [ -n "${PREFIX:-}" ] && command -v pkg >/dev/null 2>&1; then pkg install -y git
  elif command -v apt-get >/dev/null 2>&1; then (sudo apt-get install -y git 2>/dev/null || apt-get install -y git)
  else echo "Instale o git manualmente e rode de novo."; exit 1; fi
fi

echo "==> Baixando a biblioteca do WhatsApp (pode levar alguns minutos)"
# --ignore-scripts: o npm novo bloqueia scripts de instalação, e esta biblioteca não precisa deles.
npm install --omit=dev --ignore-scripts --no-audit --no-fund @whiskeysockets/baileys

echo "==> Conferindo se o CRM consegue carregar a biblioteca"
cd "$APP"
node -e "
require('./src/whatsapp/baileys-channel').carregarBiblioteca(process.argv[1]).then(
  () => console.log('Biblioteca do WhatsApp OK.'),
  (e) => { console.error('Falhou:', e.message); (e.detalhes || []).forEach((d) => console.error(' -', d)); process.exit(1); }
);" "$LIB"

echo
echo "Pronto. Agora, no CRM: Configurações > WhatsApp de suporte > Gerar código de pareamento."
