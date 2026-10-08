#!/usr/bin/env bash
# Confere se o servidor no ar (Render) esta com o codigo mais novo do
# servidor que esta no GitHub. Se estiver atrasado e houver o segredo
# RENDER_DEPLOY_HOOK, manda o Render publicar e espera ficar no ar.
#
# Por que existe (Evandro, 08/10/2026): "quando atualizar um aplicativo, ja
# atualiza no servidor, para nunca ter problema". O Render nao estava
# publicando sozinho a cada envio, e um servidor esquecido desatualizado
# quebra o aplicativo novo.
#
# Saida: 0 = servidor em dia (ou acabou de ser atualizado)
#        2 = atrasado e sem RENDER_DEPLOY_HOOK para atualizar sozinho
#        1 = mandou atualizar e nao ficou no ar a tempo
set -u
API="${API:-https://fortaleza-mov-backend.onrender.com/api}"

# Ultimo envio que mexeu no codigo do servidor (precisa do historico).
git fetch -q --unshallow 2>/dev/null || true
ALVO=$(git log -1 --format=%H -- apps/backend packages/shared)
echo "Ultima mudanca do servidor no GitHub: ${ALVO:0:7} ($(git log -1 --format=%s "$ALVO" | cut -c1-80))"

no_ar() { curl -s -m 60 "$API/health" | jq -r '.data.commit // .commit // empty' 2>/dev/null; }

em_dia() {
  local atual="$1"
  [ -n "$atual" ] || return 1
  git cat-file -e "$atual^{commit}" 2>/dev/null || git fetch -q origin "$atual" 2>/dev/null || true
  # Em dia se o commit no ar for o alvo ou mais novo que ele.
  git merge-base --is-ancestor "$ALVO" "$atual" 2>/dev/null
}

ATUAL=$(no_ar)
echo "No ar agora: ${ATUAL:0:7}"
if em_dia "$ATUAL"; then
  echo "OK: servidor em dia."
  exit 0
fi

if [ -z "${RENDER_DEPLOY_HOOK:-}" ]; then
  echo "SERVIDOR DESATUALIZADO: no ar ${ATUAL:0:7}, falta publicar ${ALVO:0:7}."
  echo "Sem o segredo RENDER_DEPLOY_HOOK no GitHub, a publicacao nao e automatica."
  exit 2
fi

echo "Servidor atrasado: mandando o Render publicar a versao nova..."
curl -s -m 60 -X POST "$RENDER_DEPLOY_HOOK" >/dev/null || true
for i in $(seq 1 48); do   # ate 12 minutos (o Render gratis leva uns 2 a 4)
  sleep 15
  ATUAL=$(no_ar)
  if em_dia "$ATUAL"; then
    echo "OK: servidor atualizado e no ar (${ATUAL:0:7}) depois de $((i * 15)) s."
    exit 0
  fi
done
echo "ERRO: o Render nao colocou a versao nova no ar em 12 minutos (no ar: ${ATUAL:0:7})."
exit 1
