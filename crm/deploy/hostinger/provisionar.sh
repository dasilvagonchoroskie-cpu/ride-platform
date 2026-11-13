#!/usr/bin/env bash
# CRM Fortaleza Move — preparação de uma VPS NOVA da Hostinger (Ubuntu 24.04 LTS).
# Rodar UMA vez, como root, no terminal da VPS:  bash provisionar.sh
# O que faz (e só isto): atualiza o sistema, instala Node.js 22 (repositório oficial NodeSource), Nginx, Certbot, firewall
# (UFW: só SSH, HTTP e HTTPS), Fail2ban, atualizações automáticas de segurança; cria o usuário de serviço sem login
# `fortaleza-crm`, as pastas com permissões fechadas e os serviços do systemd. NÃO cria chaves, NÃO copia dados, NÃO liga o CRM.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Rode como root (sudo bash provisionar.sh)."; exit 1; fi
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then echo "Este script foi feito para Ubuntu 24.04 LTS (achei: ${PRETTY_NAME:-desconhecido})."; exit 1; fi

AQUI="$(cd "$(dirname "$0")" && pwd)"
USUARIO=fortaleza-crm
APP=/opt/fortaleza-crm
DADOS=/var/lib/fortaleza-crm
CONF=/etc/fortaleza-crm
BACKUPS=/var/backups/fortaleza-crm

echo "==> 1/7 Atualizando o sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git ufw fail2ban unattended-upgrades nginx certbot python3-certbot-nginx sqlite3 build-essential python3 openssl rsync

echo "==> 2/7 Node.js 22 (NodeSource, assinado)"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y && apt-get install -y nodejs
fi
node -v

echo "==> 3/7 Usuário de serviço e pastas"
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$USUARIO"
install -d -m 0755 -o root -g root "$APP"
install -d -m 0750 -o "$USUARIO" -g "$USUARIO" "$DADOS" "$DADOS/documentos"
install -d -m 0750 -o root -g "$USUARIO" "$CONF"
install -d -m 0700 -o root -g root "$BACKUPS"
if [[ ! -f "$CONF/crm.env" ]]; then
  install -m 0640 -o root -g "$USUARIO" "$AQUI/crm.env.exemplo" "$CONF/crm.env"
  echo "    criado $CONF/crm.env a partir do modelo (preencher no passo 3 do guia)."
fi

echo "==> 4/7 Firewall (UFW): só SSH, HTTP e HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> 5/7 Fail2ban (bloqueia tentativas repetidas de SSH) e atualizações automáticas de segurança"
cat > /etc/fail2ban/jail.d/fortaleza.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
findtime = 15m
JAIL
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> 6/7 Serviços do systemd (CRM, cópia de segurança diária, verificação de saúde)"
install -m 0644 "$AQUI/crm.service" /etc/systemd/system/fortaleza-crm.service
install -m 0644 "$AQUI/crm-backup.service" /etc/systemd/system/fortaleza-crm-backup.service
install -m 0644 "$AQUI/crm-backup.timer" /etc/systemd/system/fortaleza-crm-backup.timer
install -m 0644 "$AQUI/crm-saude.service" /etc/systemd/system/fortaleza-crm-saude.service
install -m 0644 "$AQUI/crm-saude.timer" /etc/systemd/system/fortaleza-crm-saude.timer
install -d -m 0755 /usr/local/lib/fortaleza-crm
install -m 0750 "$AQUI/backup-crm.sh" "$AQUI/restaurar-backup.sh" "$AQUI/verificar-saude.sh" "$AQUI/gerar-chaves.sh" "$AQUI/instalar-crm.sh" /usr/local/lib/fortaleza-crm/
systemctl daemon-reload
# O CRM só é LIGADO depois de instalado e configurado (guia, passos 2 a 5).

echo "==> 7/7 Nginx (modelo; o domínio é configurado no passo 4 do guia)"
install -m 0644 "$AQUI/nginx-crm.conf" /etc/nginx/sites-available/fortaleza-crm.modelo
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo
echo "Pronto. Próximo passo do guia: instalar o CRM (bash /usr/local/lib/fortaleza-crm/instalar-crm.sh)."
