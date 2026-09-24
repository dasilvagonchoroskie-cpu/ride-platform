#!/usr/bin/env bash
# ============================================================
# Build do APK na propria maquina (requer Android SDK + JDK 17).
# Para uso no CI, o caminho normal e o workflow do GitHub Actions.
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${ANDROID_HOME:?Defina ANDROID_HOME apontando para o Android SDK}"
: "${JAVA_HOME:?Defina JAVA_HOME apontando para um JDK 17}"

echo "==> Instalando dependencias"
pnpm install --no-frozen-lockfile

echo "==> Compilando @ride/shared"
pnpm --filter @ride/shared build

echo "==> Gerando o projeto Android"
cd apps/mobile-passenger
npx expo prebuild --platform android --no-install

cd android
if grep -q '^reactNativeArchitectures=' gradle.properties; then
  sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a,armeabi-v7a/' gradle.properties
fi

echo "==> Compilando o APK"
chmod +x gradlew
./gradlew assembleRelease --no-daemon

APK="$(find app/build/outputs/apk -name '*.apk' | head -n 1)"
echo "APK: ${ROOT_DIR}/apps/mobile-passenger/android/${APK}"
