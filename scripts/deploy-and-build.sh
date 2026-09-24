#!/usr/bin/env bash
# ==========================================================================
# Publica o repositorio no GitHub e entrega o APK do GitHub Actions.
#
# Uso:
#   export GITHUB_TOKEN=ghp_xxx        # escopos: repo + workflow
#   export GITHUB_OWNER=seu-usuario
#   export GITHUB_REPO=ride-platform   # opcional (padrao: ride-platform)
#   ./scripts/deploy-and-build.sh
#
# Etapas:
#   1. autentica o gh com o token
#   2. cria o repositorio remoto se nao existir
#   3. commita o que faltar e faz o push
#   4. dispara o workflow "Android APKs"
#   5. acompanha a execucao ate o fim
#   6. sucesso  -> baixa o APK e imprime caminho + links
#      falha    -> imprime o log dos passos que falharam e sai com codigo 1
# ==========================================================================
set -euo pipefail

: "${GITHUB_TOKEN:?Defina GITHUB_TOKEN (escopos: repo, workflow)}"
: "${GITHUB_OWNER:?Defina GITHUB_OWNER (seu usuario ou organizacao)}"
GITHUB_REPO="${GITHUB_REPO:-ride-platform}"
BRANCH="${BRANCH:-main}"
WORKFLOW_FILE="${WORKFLOW_FILE:-android-apks.yml}"
APP="${APP:-all}"
BUILD_TYPE="${BUILD_TYPE:-release}"
ARTIFACT="${ARTIFACT:-ride-passenger-apk}"
OUT_DIR="${OUT_DIR:-./dist-apk}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_SLUG="${GITHUB_OWNER}/${GITHUB_REPO}"

echo "==> [1/6] Autenticando no GitHub"
printf '%s' "$GITHUB_TOKEN" | gh auth login --with-token
gh auth status

echo "==> [2/6] Garantindo o repositorio ${REPO_SLUG}"
if gh repo view "$REPO_SLUG" >/dev/null 2>&1; then
  echo "    repositorio ja existe"
  git remote get-url origin >/dev/null 2>&1 \
    || git remote add origin "https://github.com/${REPO_SLUG}.git"
else
  echo "    criando repositorio"
  gh repo create "$REPO_SLUG" --private --source=. --remote=origin
fi

echo "==> [3/6] Commit e push para ${BRANCH}"
git config user.name  "${GIT_USER_NAME:-genspark_dev}"
git config user.email "${GIT_USER_EMAIL:-genspark_dev@genspark.ai}"
git add -A
git diff --cached --quiet || git commit -m "ci: build automatico do APK (${GITHUB_SHA:-local})"
git branch -M "$BRANCH"
git push -u origin "$BRANCH" --force-with-lease || git push -u origin "$BRANCH"

echo "==> [4/6] Disparando o workflow ${WORKFLOW_FILE}"
gh workflow run "$WORKFLOW_FILE" --ref "$BRANCH" -f app="$APP" -f build_type="$BUILD_TYPE"

echo "    aguardando a execucao aparecer"
RUN_ID=""
for _ in $(seq 1 30); do
  sleep 5
  RUN_ID="$(gh run list --workflow="$WORKFLOW_FILE" --branch "$BRANCH" --limit 1 \
            --json databaseId,status --jq '.[0].databaseId // empty')"
  [ -n "$RUN_ID" ] && break
done

if [ -z "$RUN_ID" ]; then
  echo "ERRO: nao foi possivel identificar a execucao do workflow." >&2
  gh run list --workflow="$WORKFLOW_FILE" --limit 5 >&2 || true
  exit 1
fi

RUN_URL="https://github.com/${REPO_SLUG}/actions/runs/${RUN_ID}"
echo "    execucao: ${RUN_URL}"

echo "==> [5/6] Acompanhando o build (isso leva alguns minutos)"
if ! gh run watch "$RUN_ID" --exit-status; then
  echo "" >&2
  echo "===================== BUILD FALHOU =====================" >&2
  gh run view "$RUN_ID" --json jobs \
    --jq '.jobs[] | "JOB \(.name): \(.conclusion) → \(.steps[] | select(.conclusion=="failure") | .name)"' >&2 || true
  echo "" >&2
  echo "----- log dos passos que falharam (ultimas 150 linhas) -----" >&2
  gh run view "$RUN_ID" --log-failed 2>/dev/null | tail -n 150 >&2 || true
  echo "========================================================" >&2
  echo "Corrija o codigo e rode este script novamente." >&2
  exit 1
fi

echo "==> [6/6] Baixando o APK"
rm -rf "$OUT_DIR" && mkdir -p "$OUT_DIR"
gh run download "$RUN_ID" -n "$ARTIFACT" -D "$OUT_DIR"

APK="$(find "$OUT_DIR" -name '*.apk' | head -n 1)"
if [ -z "$APK" ]; then
  echo "ERRO: build concluiu mas nenhum APK foi baixado." >&2
  find "$OUT_DIR" -type f | head -n 20 >&2
  exit 1
fi

echo ""
echo "========================================================="
echo " APK PRONTO"
echo "========================================================="
echo " Arquivo : ${APK}"
echo " Tamanho : $(du -h "$APK" | cut -f1)"
echo " SHA-256 : $(sha256sum "$APK" | cut -d' ' -f1)"
echo ""
echo " Execucao: ${RUN_URL}"
echo " Artefato: ${RUN_URL}/artifacts"
echo " Repositorio: https://github.com/${REPO_SLUG}"
echo "========================================================="
