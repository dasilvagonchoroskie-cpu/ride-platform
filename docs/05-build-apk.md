# Build automatico dos APKs (GitHub Actions)

Workflow: `.github/workflows/android-apks.yml`

## Estrutura

| Job | O que faz | Falha quando |
|---|---|---|
| `validate` | `pnpm install` + build do `@ride/shared` + `tsc --noEmit` + `eslint --max-warnings 0` | Qualquer erro de tipo ou lint |
| `build-apk` | `expo prebuild` → valida o projeto nativo → ajusta `gradle.properties` → garante a keystore → `gradlew assembleRelease` → publica o artefato | `gradlew` ausente, nenhum APK produzido, ou erro de compilacao |

O `validate` e o portao de auto-reparacao: nenhum codigo com erro chega a etapa de
compilacao. `fail-fast: false` na matriz garante que a falha de um app nao esconde o
resultado dos outros.

## Por que um APK **release** e nao debug

Um APK de debug **nao** embute o bundle JavaScript: ele espera um servidor Metro rodando
na maquina do desenvolvedor. Instalado em um celular comum, abre uma tela vermelha de
erro. Por isso o workflow usa `assembleRelease`, que embute o bundle e produz um APK
autonomeo.

O template Android do Expo/React Native assina o release com o `debug.keystore` do
proprio projeto — por isso o workflow o gera caso nao exista. Nenhum segredo e necessario
no repositorio. Para publicar na Play Store, troque a `signingConfig` de release por uma
keystore de producao guardada em GitHub Secrets.

## Multiplos apps (matriz)

A matriz `build-apk.strategy.matrix.include` controla quais apps sao compilados. Para
adicionar o app do motorista, basta descomentar a entrada correspondente:

```yaml
matrix:
  include:
    - app: mobile-passenger
      label: Passageiro
      artifact: ride-passenger-apk
      apk_name: ride-passenger
    - app: mobile-driver          # <-- basta descomentar
      label: Motorista
      artifact: ride-driver-apk
      apk_name: ride-driver
```

Cada app gera um artefato proprio (`ride-passenger-apk`, `ride-driver-apk`), baixavel
separadamente na execucao.

## Como baixar o APK

1. Aba **Actions** → execucao **Android APKs**.
2. Fim da pagina → secao **Artifacts** → **ride-passenger-apk**.
3. O ZIP contem `ride-passenger-<numero-da-execucao>.apk`.
4. No Android, habilite "Instalar de fontes desconhecidas" para o navegador/gerenciador
   de arquivos.

O resumo da execucao (**Summary**) traz nome do arquivo, tamanho e SHA-256 do APK.

## Disparo manual

```bash
gh workflow run android-apks.yml -f app=all -f build_type=release
gh run watch
gh run download --name ride-passenger-apk -D ./dist-apk
```

Ou, de uma vez, com o script do repositorio:

```bash
export GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=seu-usuario GITHUB_REPO=ride-platform
./scripts/push-and-watch.sh
```

## Configuracao do app embutida no APK

| Variavel | Efeito |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL do backend. Vazia = **modo demonstracao** (fluxo completo local, sem rede). |
| `EXPO_PUBLIC_DEMO_MODE` | `auto` (padrao) testa a API e cai para demo; `true` forca demo; `false` forca API. |
| `GOOGLE_MAPS_ANDROID_KEY` | Chave do Google Maps. Sem ela, o mapa e renderizado em SVG. |

Para gerar um APK apontando para um backend real, acrescente o `env` no passo de prebuild:

```yaml
- name: Gerar o projeto Android (expo prebuild)
  working-directory: apps/${{ matrix.app }}
  env:
    EXPO_PUBLIC_API_URL: 'https://sua-api.exemplo.com'
    EXPO_PUBLIC_DEMO_MODE: 'false'
  run: npx expo prebuild --platform android --no-install
```

## Validacao executada localmente

Antes de publicar, cada etapa critica do workflow foi executada neste ambiente:

| Etapa do workflow | Comando equivalente | Resultado |
|---|---|---|
| YAML valido | `yaml.safe_load` | 2 jobs, 16 passos — OK |
| Lint do workflow | `actionlint` | **0 problemas** |
| Typecheck | `tsc --noEmit` | **0 erros** |
| Lint do app | `eslint --ext .ts,.tsx --max-warnings 0` | **0 erros, 0 warnings** |
| `expo prebuild` | `npx expo prebuild --platform android --no-install` | exit 0; `gradlew`, `gradle.properties` e `settings.gradle` gerados |
| Patch do `gradle.properties` | funcao `set_prop` do workflow | `reactNativeArchitectures=arm64-v8a,armeabi-v7a`, `newArchEnabled=false`, `jvmargs=-Xmx4096m` |
| Geracao da keystore | `keytool -genkeypair ...` | `keytool` disponivel (JDK 21) |

Nao validado localmente (por limite de memoria do sandbox — ~1,2 GB livres contra os 4 GB
que o Gradle exige): o `assembleRelease` em si. Essa etapa roda no runner do GitHub, que
tem 7 GB de RAM.

### Bug corrigido pela validacao

O upload do artefato usava um caminho relativo calculado em um passo com
`working-directory`, mas o `actions/upload-artifact` resolvia o caminho a partir da raiz
do repositorio — o artefato nunca seria encontrado. Agora o passo emite o caminho
**absoluto** (`$GITHUB_WORKSPACE/dist/...`) e o `upload-artifact` o consome direto.
