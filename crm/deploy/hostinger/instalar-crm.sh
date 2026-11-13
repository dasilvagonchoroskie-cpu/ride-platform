#!/usr/bin/env bash
# Instala ou ATUALIZA o código do CRM na VPS (como root):  bash instalar-crm.sh [ramo]
# Baixa o código do GitHub (ramo `main` por padrão — só use outro ramo com autorização do dono), instala as dependências
# exatas (npm ci), a biblioteca do WhatsApp com versão fixa, roda os testes automáticos e só então troca a versão no ar.
# Se os testes falharem, a versão anterior continua no ar. Não mexe em dados nem em chaves.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Rode como root."; exit 1; }
RAMO="${1:-main}"
REPO="https://github.com/dasilvagonchoroskie-cpu/ride-platform.git"
BASE=/opt/fortaleza-crm
NOVO="$BASE/releases/$(date +%Y%m%d-%H%M%S)"
install -d -m 0755 "$BASE/releases"

echo "==> Baixando o código (ramo $RAMO)"
TMP="$(mktemp -d)"
git clone --depth 1 --branch "$RAMO" "$REPO" "$TMP/repo"
mv "$TMP/repo/crm" "$NOVO"
( cd "$TMP/repo" && git rev-parse HEAD ) > "$NOVO/VERSAO"
rm -rf "$TMP"

echo "==> Dependências (exatas, sem scripts de instalação desnecessários)"
cd "$NOVO"
npm ci --no-audit --no-fund
echo "==> Testes automáticos (com dados fictícios em pasta temporária)"
if ! npm test; then echo "TESTES FALHARAM: a versão no ar NÃO foi trocada."; rm -rf "$NOVO"; exit 1; fi
npm prune --omit=dev
rm -rf test

echo "==> Biblioteca do WhatsApp (versão fixa)"
install -d -m 0755 "$BASE/wa-lib"
cp wa-lib/package.json wa-lib/package-lock.json "$BASE/wa-lib/"
( cd "$BASE/wa-lib" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund )

chown -R root:root "$NOVO"
ln -sfn "$NOVO" "$BASE/app.novo" && mv -T "$BASE/app.novo" "$BASE/app"
echo "==> Versão instalada: $(cat "$NOVO/VERSAO")"
if systemctl is-active --quiet fortaleza-crm; then
  systemctl restart fortaleza-crm
  sleep 5
  /usr/local/lib/fortaleza-crm/verificar-saude.sh || { echo "ATENÇÃO: o CRM não respondeu depois da atualização. Veja: journalctl -u fortaleza-crm -n 100"; exit 1; }
fi
# Guarda as 5 últimas versões (para voltar atrás: ln -sfn <pasta antiga> /opt/fortaleza-crm/app && systemctl restart fortaleza-crm).
ls -1dt "$BASE"/releases/* | tail -n +6 | xargs -r rm -rf
echo "Pronto."
