#!/usr/bin/env bash
# Leva o banco de Sao Paulo (Supabase sa-east-1) para a California
# (Supabase us-west-1), perto do servidor do Render (Oregon). Evandro
# aprovou em 09/10/2026: cada consulta ao banco levava ~0,2 s de viagem
# EUA <-> Brasil e um pedido de corrida faz dezenas delas.
#
# Precisa de: ANTIGO (endereco do banco antigo, segredo DATABASE_URL do
# GitHub) e do cliente do Postgres 17. A senha do banco novo vem
# criptografada em infra/novo-banco.enc (a chave e a senha do banco antigo,
# que so existe nos segredos).
#
# Copia so o esquema public (tabelas do sistema, dados e indices). Nao
# mostra senha nenhuma no relatorio.
set -euo pipefail
REL=logs/migracao-banco.txt
mkdir -p logs
: > "$REL"
log() { echo "$1" | tee -a "$REL"; }

REF_NOVO=dluphbekvokxdanrkmqx
SENHA_ANTIGA=$(python3 -c 'import os,urllib.parse as u;print(u.urlparse(os.environ["ANTIGO"].strip()).password or "")')
[ -n "$SENHA_ANTIGA" ] || { log "ERRO: segredo DATABASE_URL vazio ou sem senha."; exit 1; }
echo "::add-mask::$SENHA_ANTIGA"
SENHA_NOVA=$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -a -in infra/novo-banco.enc -pass "pass:$SENHA_ANTIGA") \
  || { log "ERRO: nao consegui abrir a senha do banco novo."; exit 1; }
echo "::add-mask::$SENHA_NOVA"

# libpq nao aceita o parametro "schema" do Prisma.
ANT=$(python3 - <<'PY'
import os, urllib.parse as u
p = u.urlparse(os.environ["ANTIGO"].strip())
q = [(k, v) for k, v in u.parse_qsl(p.query) if k != "schema"]
print(u.urlunparse(p._replace(query=u.urlencode(q))))
PY
)
psql "$ANT" -Atc 'select 1' >/dev/null || { log "ERRO: o banco antigo nao respondeu."; exit 1; }
log "Banco antigo (Sao Paulo) responde."

NOVO=""; HOST=""
for h in aws-0-us-west-1.pooler.supabase.com aws-1-us-west-1.pooler.supabase.com; do
  U="postgresql://ride_app.$REF_NOVO:$SENHA_NOVA@$h:5432/postgres?sslmode=require"
  if psql "$U" -Atc 'select 1' >/dev/null 2>&1; then NOVO="$U"; HOST="$h"; break; fi
done
[ -n "$NOVO" ] || { log "ERRO: o banco novo nao respondeu em nenhum endereco."; exit 1; }
log "Banco novo (California) responde em $HOST"
echo "host_novo=$HOST" >> "${GITHUB_OUTPUT:-/dev/null}"

# O banco novo tem que estar vazio (nao sobrescreve nada por engano).
JA=$(psql "$NOVO" -Atc "select count(*) from pg_tables where schemaname='public' and tableowner='ride_app'")
if [ "$JA" != "0" ] && [ "${SOBRESCREVER:-}" != "sim" ]; then
  log "ERRO: o banco novo ja tem $JA tabelas. Nada foi feito."
  exit 1
fi
if [ "$JA" != "0" ]; then
  log "Banco novo tinha $JA tabelas: apagando para copiar de novo."
  psql "$NOVO" -v ON_ERROR_STOP=1 -Atc "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' and tableowner='ride_app' loop execute format('drop table if exists public.%I cascade', t); end loop; end \$\$;" >/dev/null
  psql "$NOVO" -Atc "do \$\$ declare t text; begin for t in select typname from pg_type ty join pg_namespace n on n.oid=ty.typnamespace join pg_roles r on r.oid=ty.typowner where n.nspname='public' and r.rolname='ride_app' and ty.typtype='e' loop execute format('drop type if exists public.%I cascade', t); end loop; end \$\$;" >/dev/null || true
fi

T0=$(date +%s)
pg_dump "$ANT" --schema=public --no-owner --no-privileges --format=custom \
  --exclude-table=public.spatial_ref_sys --file /tmp/banco.dump 2> /tmp/dump-erros.txt \
  || { log "ERRO no pg_dump:"; sed 's/postgresql:[^ ]*/[endereco]/g' /tmp/dump-erros.txt | head -20 | tee -a "$REL"; exit 1; }
log "Copia do banco antigo: $(du -h /tmp/banco.dump | cut -f1) em $(( $(date +%s) - T0 )) s."

T1=$(date +%s)
set +e
pg_restore --no-owner --no-privileges --dbname "$NOVO" /tmp/banco.dump 2> /tmp/restore-erros.txt
set -e
# Erros esperados: extensoes que ja existem no banco novo (criadas antes).
grep -E "error|ERROR" /tmp/restore-erros.txt | grep -viE "already exists|must be owner of extension|must be owner of schema public|extension .* does not exist|COMMENT ON EXTENSION|errors ignored on restore" \
  | sed 's/postgresql:[^ ]*/[endereco]/g' > /tmp/erros-reais.txt || true
log "Restauracao no banco novo em $(( $(date +%s) - T1 )) s; erros fora do esperado: $(wc -l < /tmp/erros-reais.txt)."
head -20 /tmp/erros-reais.txt | tee -a "$REL"

# Confere tabela por tabela: mesma quantidade de linhas nos dois bancos.
DIF=0
for t in $(psql "$ANT" -Atc "select tablename from pg_tables where schemaname='public' and tableowner='ride_app' order by 1"); do
  a=$(psql "$ANT" -Atc "select count(*) from public.\"$t\"")
  n=$(psql "$NOVO" -Atc "select count(*) from public.\"$t\"" 2>/dev/null || echo "FALTA")
  if [ "$a" = "$n" ]; then log "OK     $t: $a"; else log "DIFERE $t: antigo $a, novo $n"; DIF=$((DIF+1)); fi
done
FUNC=$(psql "$NOVO" -Atc "select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='set_updated_at'")
log "Funcao set_updated_at no banco novo: $FUNC"
GIST=$(psql "$NOVO" -Atc "select count(*) from pg_indexes where schemaname='public' and indexdef ilike '%gist%'")
log "Indices espaciais (GiST) no banco novo: $GIST"
if [ "$DIF" -gt 0 ] || [ -s /tmp/erros-reais.txt ]; then
  log "RESULTADO: COM PROBLEMAS ($DIF tabela(s) diferentes)."
  exit 1
fi
log "RESULTADO: banco copiado sem diferencas."
