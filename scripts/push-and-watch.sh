#!/usr/bin/env bash
# ============================================================
# Publica o repositorio no GitHub e acompanha o build do APK.
#
# Uso:
#   export GITHUB_TOKEN=ghp_xxx          # escopos: repo + workflow
#   export GITHUB_OWNER=seu-usuario
#   export GITHUB_REPO=ride-platform
#   ./scripts/push-and-watch.sh
#
# O script:
#   1. cria o repositorio remoto se nao existir;
#   2. faz o push da branch atual;
#   3. dispara o workflow "Android APKs";
#   4. acompanha a execucao ate o fim;
#   5. baixa o APK e imprime o caminho local.
# ============================================================
set -euo pipefail

: "${GITHUB_TOKEN:?Defina GITHUB_TOKEN (escopos: repo, workflow)}"
: "${GITHUB_OWNER:?Defina GITHUB_OWNER (seu usuario ou organizacao)}"
GITHUB_REPO="${GITHUB_REPO:-ride-platform}"
BRANCH="${BRANCH:-main}"
WORKFLOW_FILE="android-apks.yml"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export GH_TOKEN="$GITHUB_TOKEN"

echo "==> Verificando autenticacao"
gh auth status

echo "==> Garantindo o repositorio ${GITHUB_OWNER}/${GITHUB_REPO}"
if ! gh repo view "${GITHUB_OWNER}/${GITHUB_REPO}" >/dev/null 2>&1; then
  gh repo create "${GITHUB_OWNER}/${GITHUB_REPO}" --private --source=. --remote=origin --push
else
  git remote get-url origin >/dev/null 2>&1 || \
    git remote add origin "https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git"
fi

echo "==> Enviando a branch ${BRANCH}"
git add -A
git diff --cached --quiet || git commit -m "build(apk): app do passageiro - fluxo completo de corrida"
git branch -M "$BRANCH"
git push -u origin "$BRANCH"

echo "==> Disparando o workflow"
gh workflow run "$WORKFLOW_FILE" --ref "$BRANCH" -f app=all -f build_type=release

sleep 8
RUN_ID="$(gh run list --workflow="$WORKFLOW_FILE" --branch "$BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId')"
echo "==> Execucao: ${RUN_ID}"

gh run watch "$RUN_ID" --exit-status || {
  echo "==> Build falhou. Ultimas linhas do log:"
  gh run view "$RUN_ID" --log-failed | tail -n 120
  exit 1
}

echo "==> Baixando o APK"
rm -rf ./dist-apk && mkdir -p ./dist-apk
gh run download "$RUN_ID" -D ./dist-apk

APK="$(find ./dist-apk -name '*.apk' | head -n 1)"
echo ""
echo "APK disponivel em: ${APK}"
echo "Link do artefato: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${RUN_ID}"
