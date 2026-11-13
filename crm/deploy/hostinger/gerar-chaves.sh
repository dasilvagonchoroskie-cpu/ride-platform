#!/usr/bin/env bash
# Gera, NA VPS, só as chaves que ainda estão VAZIAS em /etc/fortaleza-crm/crm.env (nunca troca uma chave existente):
#   FM_DOCS_KEY, FM_DADOS_KEY, FM_INTEGRACAO_SEGREDO e a chave das cópias de segurança (/etc/fortaleza-crm/backup.chave).
# As chaves SNAPSHOT_* NÃO são geradas aqui: vêm do Render (sem elas os dados atuais não são trazidos).
# Depois de rodar: copiar as chaves para o cofre de senhas do dono (perder FM_DOCS_KEY = perder os documentos).
set -euo pipefail
umask 077
ENV=/etc/fortaleza-crm/crm.env
[[ $EUID -eq 0 ]] || { echo "Rode como root."; exit 1; }
gerar() {
  local nome="$1"
  local atual; atual="$(grep -E "^${nome}=" "$ENV" | head -1 | cut -d= -f2- || true)"
  if [[ -n "$atual" ]]; then echo "  $nome já existe: mantida (não troco chave existente)."; return; fi
  local v; v="$(openssl rand -hex 32)"
  if grep -qE "^${nome}=" "$ENV"; then sed -i "s|^${nome}=.*|${nome}=${v}|" "$ENV"; else echo "${nome}=${v}" >> "$ENV"; fi
  echo "  $nome gerada."
}
gerar FM_DOCS_KEY
gerar FM_DADOS_KEY
gerar FM_INTEGRACAO_SEGREDO
if [[ ! -s /etc/fortaleza-crm/backup.chave ]]; then openssl rand -hex 32 > /etc/fortaleza-crm/backup.chave; chmod 600 /etc/fortaleza-crm/backup.chave; echo "  chave das cópias de segurança gerada."; else echo "  chave das cópias de segurança já existe: mantida."; fi
chown root:fortaleza-crm "$ENV" && chmod 640 "$ENV"
echo
echo "AGORA: copie estes valores para o cofre de senhas (NÃO mande por mensagem):"
echo "  sudo grep -E '^(FM_DOCS_KEY|FM_DADOS_KEY|FM_INTEGRACAO_SEGREDO)=' $ENV ; sudo cat /etc/fortaleza-crm/backup.chave"
