# Build do APK (App do Passageiro)

O APK e gerado pelo GitHub Actions, no workflow `.github/workflows/android-passenger.yml`.

## Por que um APK **release** e nao debug

Um APK de debug **nao** embute o bundle JavaScript: ele espera um servidor Metro rodando na
maquina do desenvolvedor. Instalado em um celular comum, abre uma tela vermelha de erro.
Por isso o workflow usa `assembleRelease`, que embute o bundle e produz um APK autonomeo.

O template Android do Expo/React Native assina o build de release com o `debug.keystore`
incluido no proprio projeto — nao e preciso configurar segredos no repositorio para gerar
um APK instalavel. Para publicar na Play Store, troque a `signingConfig` de release por uma
keystore de producao guardada em GitHub Secrets.

## Estrutura do workflow

| Job | O que faz |
|---|---|
| `validate` | `pnpm install` + build do `@ride/shared` + `tsc --noEmit` + `eslint`. Se falhar, o build nem comeca. |
| `build-apk` | `expo prebuild` → `gradlew assembleRelease` → upload do artefato `ride-passenger-apk` |

## Como baixar o APK

1. Aba **Actions** do repositorio → execucao **Android APK — App do Passageiro**.
2. No fim da pagina, secao **Artifacts** → **ride-passenger-apk**.
3. O ZIP contem `ride-passenger-<numero-da-execucao>.apk`.
4. No Android, habilite "Instalar de fontes desconhecidas" para o navegador/gerenciador de arquivos.

## Disparo manual

```bash
gh workflow run android-passenger.yml -f build_type=release
gh run watch
gh run download --name ride-passenger-apk -D ./dist-apk
```

## Build local (opcional)

Requer JDK 17 e Android SDK:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./scripts/build-apk-local.sh
```

## Configuracao do app no APK

| Variavel | Efeito |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL do backend. Vazia = **modo demonstracao** (fluxo completo local). |
| `EXPO_PUBLIC_DEMO_MODE` | `auto` (padrao) tenta a API e cai para demo; `true` forca demo; `false` forca API. |
| `GOOGLE_MAPS_ANDROID_KEY` | Chave do Google Maps. Sem ela, o mapa e renderizado em SVG. |

Para gerar um APK apontando para um backend real, defina as variaveis no passo
"Gerar o projeto Android" do workflow:

```yaml
- name: Gerar o projeto Android (expo prebuild)
  working-directory: apps/mobile-passenger
  env:
    EXPO_PUBLIC_API_URL: 'https://sua-api.exemplo.com'
    EXPO_PUBLIC_DEMO_MODE: 'false'
  run: npx expo prebuild --platform android --no-install
```
