#!/usr/bin/env bash
# R5 (Requisicao de continuidade, 11/11/2026) — procedimento EXCEPCIONAL.
#
# Quando usar: o DONO da Central perdeu o celular do Google Authenticator E
# os 8 codigos de recuperacao. Nao e senha mestra nem atalho: so roda pela
# esteira "Recuperacao excepcional do dono", que
#   - so pode ser disparada por quem tem escrita no repositorio;
#   - espera a APROVACAO do dono no ambiente "recuperacao-excepcional"
#     (GitHub > Settings > Environments > Required reviewers);
#   - exige a frase de confirmacao e o nome do responsavel tecnico;
#   - grava tudo na auditoria (audit_logs) e no registro da esteira.
#
# O que faz, numa transacao:
#   1. desliga as duas etapas da conta do dono (apaga o segredo antigo e os
#      codigos de recuperacao: o celular perdido deixa de valer);
#   2. derruba TODAS as sessoes e aparelhos (inclusive o acesso de 15 min);
#   3. marca "refazerDoisFatores": a Central so volta a funcionar depois de
#      ligar o Google Authenticator de novo (celular novo);
#   4. grava na auditoria: quem pediu, quem aprovou (esteira), o motivo.
# A senha NAO muda: o dono entra com a senha (ou o codigo do e-mail) e liga
# o autenticador novo. Nao mexe em mais nada.
set -euo pipefail

: "${DATABASE_URL:?segredo DATABASE_URL ausente}"
: "${EMAIL_DONO:?informe o e-mail da conta do dono}"
: "${MOTIVO:?informe o motivo}"
: "${RESPONSAVEL:?informe o responsavel tecnico}"
: "${CONFIRMACAO:?confirmacao ausente}"

FRASE='EU SOU O DONO E ESTOU PRESENTE'
if [ "$CONFIRMACAO" != "$FRASE" ]; then
  echo "ERRO: a confirmacao tem que ser exatamente: $FRASE"
  exit 1
fi
if [ ${#MOTIVO} -lt 15 ]; then
  echo "ERRO: escreva o motivo com mais detalhe (15 letras ou mais)."
  exit 1
fi

# Valores entram como variaveis do psql (:'nome'), nunca colados no SQL.
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -At \
  -v email="$EMAIL_DONO" -v motivo="$MOTIVO" -v responsavel="$RESPONSAVEL" \
  -v executor="${GITHUB_ACTOR:-desconhecido}" -v execucao="${EXECUCAO:-}" <<'SQL'
BEGIN;
CREATE TEMP TABLE alvo ON COMMIT DROP AS
  SELECT id FROM users
   WHERE lower(email) = lower(:'email')
     AND role = 'ADMIN'
     AND deleted_at IS NULL
     AND coalesce(metadata->>'praca', '') = '';
DO $$
BEGIN
  IF (SELECT count(*) FROM alvo) <> 1 THEN
    RAISE EXCEPTION 'Nao achei exatamente UMA conta de dono da Central com esse e-mail. Nada foi mudado.';
  END IF;
END $$;
UPDATE users u
   SET metadata = (coalesce(u.metadata, '{}'::jsonb) - 'doisFatores' - 'sessoesExceto')
                  || jsonb_build_object(
                       'refazerDoisFatores', true,
                       'sessoesDesde', (floor(extract(epoch from clock_timestamp()) * 1000) + 1000)::bigint)
 WHERE u.id IN (SELECT id FROM alvo);
UPDATE refresh_tokens SET revoked_at = now() WHERE user_id IN (SELECT id FROM alvo) AND revoked_at IS NULL;
UPDATE devices SET fcm_token = NULL WHERE user_id IN (SELECT id FROM alvo);
INSERT INTO audit_logs (id, actor_id, actor_role, action, entity, entity_id, after, created_at)
SELECT gen_random_uuid(), NULL, NULL, 'RECUPERACAO_EXCEPCIONAL_DONO', 'user', id::text,
       jsonb_build_object(
         'motivo', :'motivo',
         'responsavelTecnico', :'responsavel',
         'disparadoPor', :'executor',
         'execucao', :'execucao',
         'feito', jsonb_build_array('duas etapas desligadas', 'todas as sessoes encerradas', 'refazer duas etapas no proximo acesso')),
       now()
  FROM alvo;
COMMIT;
SQL
echo "OK: duas etapas redefinidas, sessoes encerradas e registro gravado na auditoria."
echo "Proximo passo (dono, com o celular novo): entrar na Central com a senha ou o codigo do e-mail e ligar o Google Authenticator."
echo "Observacao: o servidor pode levar ate 1 minuto para notar (memoria rapida das contas)."
