#!/usr/bin/env bash
# Cópia de segurança diária do CRM (roda pelo timer fortaleza-crm-backup, como root).
#  1. banco SQLite pela API de backup online (sem parar o CRM) + integrity_check;
#  2. documentos (já cifrados) com o manifesto de verificação (npm run docs:backup);
#  3. sessão do WhatsApp e chaves da IA da pasta de dados;
#  4. tudo num pacote CIFRADO (AES-256 com chave de 256 bits em /etc/fortaleza-crm/backup.chave, gerada na VPS);
#  5. guarda 14 diárias + 8 semanais; opcionalmente envia para fora da VPS (BACKUP_DESTINO_RCLONE).
# O arquivo /etc/fortaleza-crm/crm.env NÃO entra no pacote (chaves ficam só no cofre de senhas do dono).
set -euo pipefail
umask 077
DADOS=/var/lib/fortaleza-crm
APP=/opt/fortaleza-crm/app
DEST=/var/backups/fortaleza-crm
CHAVE=/etc/fortaleza-crm/backup.chave
STAMP="$(date +%Y-%m-%d_%H%M)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
[[ -s "$CHAVE" ]] || { echo "Falta $CHAVE (rode gerar-chaves.sh)."; exit 1; }
set -a; . /etc/fortaleza-crm/crm.env; set +a
chmod 0711 "$TMP"
# Roda um comando do CRM como o usuário do serviço, com as variáveis do crm.env (sem expor valores na linha de comando).
comoCrm() { runuser -u fortaleza-crm -- bash -c 'set -a; . /etc/fortaleza-crm/crm.env; set +a; exec "$@"' _ "$@"; }
install -d -m 0700 -o fortaleza-crm -g fortaleza-crm "$TMP/db" "$TMP/documentos"

echo "[backup] banco"
cd "$APP"
comoCrm node scripts/backup.js "$TMP/db" >/dev/null
DB="$(ls "$TMP"/db/*.db)"
[[ "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" == "ok" ]] || { echo "[backup] banco com problema de integridade: abortado"; exit 1; }

if [[ -d "$DADOS/documentos" ]] && [[ -n "${FM_DOCS_KEY:-}" ]]; then
  echo "[backup] documentos (cifrados)"
  comoCrm node scripts/docs-backup.js "$TMP/documentos" >/dev/null
fi
echo "[backup] sessão do WhatsApp e chaves da IA"
rsync -a --exclude 'documentos/' --exclude 'backups/' --exclude 'wa-lib/' --exclude '*.db' --exclude '*.db-wal' --exclude '*.db-shm' "$DADOS/" "$TMP/dados/"

chown -R root:root "$TMP/db" "$TMP/documentos"
echo "[backup] empacotando e cifrando"
tar -C "$TMP" -czf "$TMP/pacote.tgz" .
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -md sha256 -pass "file:$CHAVE" -in "$TMP/pacote.tgz" -out "$DEST/crm-$STAMP.tgz.enc"
sha256sum "$DEST/crm-$STAMP.tgz.enc" > "$DEST/crm-$STAMP.tgz.enc.sha256"
echo "[backup] criado $DEST/crm-$STAMP.tgz.enc ($(du -h "$DEST/crm-$STAMP.tgz.enc" | cut -f1))"

# Rotação: 14 mais recentes + 1 por semana das últimas 8 semanas (domingos).
cd "$DEST"
ls -1t crm-*.tgz.enc | tail -n +15 | while read -r f; do
  dia="$(date -d "${f:4:10}" +%u 2>/dev/null || echo 0)"
  idade="$(( ( $(date +%s) - $(date -d "${f:4:10}" +%s 2>/dev/null || date +%s) ) / 86400 ))"
  if [[ "$dia" == "7" && "$idade" -le 56 ]]; then continue; fi
  rm -f "$f" "$f.sha256"
done

# Cópia fora da VPS (recomendado): configurar o rclone com um destino do dono e pôr BACKUP_DESTINO_RCLONE no crm.env.
if [[ -n "${BACKUP_DESTINO_RCLONE:-}" ]] && command -v rclone >/dev/null; then
  rclone copy "$DEST/crm-$STAMP.tgz.enc" "$BACKUP_DESTINO_RCLONE" && rclone copy "$DEST/crm-$STAMP.tgz.enc.sha256" "$BACKUP_DESTINO_RCLONE" && echo "[backup] enviado para fora da VPS"
fi
