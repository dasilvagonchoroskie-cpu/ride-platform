#!/usr/bin/env bash
# Verificação de saúde (timer a cada 5 min): o CRM responde? o disco tem espaço? a cópia de segurança de hoje existe?
# Problemas vão para o diário do sistema (journalctl -t fortaleza-crm-saude). Se o CRM não responder 3 vezes seguidas,
# reinicia o serviço (o systemd já reinicia quando o processo cai; isto cobre o caso "vivo mas travado").
set -uo pipefail
ESTADO=/var/lib/fortaleza-crm-saude
mkdir -p "$ESTADO"
log() { logger -t fortaleza-crm-saude "$*"; echo "$*"; }
falhas="$(cat "$ESTADO/falhas" 2>/dev/null || echo 0)"
if curl -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null; then
  echo 0 > "$ESTADO/falhas"
else
  falhas=$((falhas + 1)); echo "$falhas" > "$ESTADO/falhas"
  log "CRM não respondeu ($falhas vez(es) seguidas)"
  if [[ "$falhas" -ge 3 ]]; then log "reiniciando o CRM"; systemctl restart fortaleza-crm; echo 0 > "$ESTADO/falhas"; fi
  exit 1
fi
uso="$(df --output=pcent /var/lib/fortaleza-crm | tail -1 | tr -dc '0-9')"
[[ "$uso" -ge 85 ]] && log "disco com ${uso}% de uso"
if ! ls /var/backups/fortaleza-crm/crm-"$(date +%Y-%m-%d)"_*.tgz.enc >/dev/null 2>&1 && [[ "$(date +%H)" -ge 5 ]]; then log "cópia de segurança de hoje ainda não existe"; fi
exit 0
