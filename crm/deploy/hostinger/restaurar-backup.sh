#!/usr/bin/env bash
# Restauração / TESTE de restauração de uma cópia de segurança (como root).
#   bash restaurar-backup.sh /var/backups/fortaleza-crm/crm-AAAA-MM-DD_HHMM.tgz.enc            → só TESTA (padrão)
#   bash restaurar-backup.sh <arquivo> --aplicar                                              → restaura de verdade
# Teste: confere o SHA-256, decifra numa pasta temporária, roda integrity_check do banco e a verificação dos documentos.
# Aplicar: para o CRM, guarda a pasta de dados atual ao lado (nada é apagado), coloca a cópia no lugar e liga de novo.
set -euo pipefail
umask 077
ARQ="${1:?informe o arquivo .tgz.enc}"
MODO="${2:-teste}"
CHAVE=/etc/fortaleza-crm/backup.chave
DADOS=/var/lib/fortaleza-crm
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -f "$ARQ.sha256" ]] && sha256sum -c "$ARQ.sha256" || echo "(sem arquivo .sha256 ao lado: pulei a conferência do resumo)"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass "file:$CHAVE" -in "$ARQ" -out "$TMP/pacote.tgz"
mkdir "$TMP/x" && tar -C "$TMP/x" -xzf "$TMP/pacote.tgz"
DB="$(ls "$TMP"/x/db/*.db)"
[[ "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" == "ok" ]] || { echo "Banco da cópia com problema de integridade."; exit 1; }
echo "Banco OK: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM users;') usuário(s), $(sqlite3 "$DB" 'SELECT COUNT(*) FROM motoristas;') motorista(s)."
if [[ -d "$TMP/x/documentos" ]]; then
  # Teste isolado: banco, dados e documentos apontam para pastas TEMPORÁRIAS (nada do CRM no ar é tocado).
  mkdir -p "$TMP/teste/documentos" && cp "$DB" "$TMP/teste/teste.db"
  ( set -a; . /etc/fortaleza-crm/crm.env; set +a
    export FM_DATA_DIR="$TMP/teste" FM_DB_PATH="$TMP/teste/teste.db" DOCS_DIR="$TMP/teste/documentos" DOCS_STORAGE=local SNAPSHOT_URL=
    cd /opt/fortaleza-crm/app && node scripts/docs-restaurar.js "$TMP/x/documentos" >/dev/null ) \
    && echo "Documentos: cópia íntegra e decifrável com a chave atual." \
    || { echo "Documentos da cópia NÃO passaram na verificação (chave diferente ou arquivo corrompido)."; exit 1; }
fi
if [[ "$MODO" != "--aplicar" ]]; then echo "TESTE DE RESTAURAÇÃO: OK (nada foi alterado)."; exit 0; fi

read -r -p "Isto troca os dados do CRM pela cópia de $ARQ. Digite RESTAURAR para continuar: " ok
[[ "$ok" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }
systemctl stop fortaleza-crm
GUARDA="$DADOS.antes-restauracao-$(date +%Y%m%d-%H%M%S)"
cp -a "$DADOS" "$GUARDA"
install -m 0600 -o fortaleza-crm -g fortaleza-crm "$DB" "$DADOS/crm.db"
rm -f "$DADOS/crm.db-wal" "$DADOS/crm.db-shm"
rsync -a "$TMP/x/dados/" "$DADOS/" && chown -R fortaleza-crm:fortaleza-crm "$DADOS"
if [[ -d "$TMP/x/documentos" ]]; then
  chmod 0711 "$TMP" "$TMP/x"; chown -R fortaleza-crm:fortaleza-crm "$TMP/x/documentos"
  ( cd /opt/fortaleza-crm/app && runuser -u fortaleza-crm -- bash -c 'set -a; . /etc/fortaleza-crm/crm.env; set +a; exec node scripts/docs-restaurar.js "$1"' _ "$TMP/x/documentos" )
fi
systemctl start fortaleza-crm
echo "Restaurado. Os dados anteriores ficaram guardados em $GUARDA."
