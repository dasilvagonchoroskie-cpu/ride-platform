# Contas, chaves e restauração (etapa 7)

Este arquivo fica no repositório, que é **público**: aqui só vão os NOMES das
contas e das variáveis, e onde cada coisa fica. Nenhuma senha, chave ou
endereço de banco entra aqui. Os valores ficam no Render, nos segredos do
GitHub e no arquivo do projeto do Evandro.

## 1. Serviços

| Serviço | Para quê | Onde ficam as credenciais | Dono |
|---|---|---|---|
| GitHub (este repositório) | código, esteiras (APK, testes, cópia do banco) | Settings → Secrets and variables → Actions | Evandro |
| Render | servidor (NestJS) | Environment do serviço `fortaleza-mov-backend` | Evandro |
| Supabase | banco PostgreSQL + PostGIS | `DATABASE_URL` no Render | Evandro |
| TomTom | mapa, busca de endereço e rotas | `TOMTOM_API_KEY` no Render (nunca no app nem no código) | Evandro |
| Firebase (projeto fortaleza-mov) | aviso push | `FCM_*` no Render; configuração pública em `infra/firebase-apps.b64` | Evandro |
| Gmail (Apps Script) | e-mail com o código de entrada | `EMAIL_GOOGLE_SCRIPT_URL` e `EMAIL_GOOGLE_SCRIPT_SEGREDO` no Render | Evandro |
| Google Cloud (opcional) | Google Maps, se um dia ligar | `infra/mapas.b64` (chave restrita aos apps) e `GOOGLE_MAPS_API_KEY` | Evandro |
| Google Play (quando publicar) | loja | conta de desenvolvedor do Evandro | Evandro |

## 2. Variáveis do servidor (Render → Environment)

- Banco e cache: `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- Login: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `OTP_*`.
  - **Atenção:** o segredo do autenticador (duas etapas da Central) é guardado
    cifrado com uma chave tirada do `JWT_ACCESS_SECRET`. Se esse valor for
    trocado, os códigos do Google Authenticator param de valer: entre com um
    **código de recuperação**, desligue e ligue de novo as duas etapas.
  - `OTP_CHAVE_TESTE`: só a esteira de testes usa (mesmo valor do segredo do GitHub).
- Mapa: `TOMTOM_API_KEY`, `TOMTOM_COTA_MES`, `MAPA_PROVEDOR` (`tomtom` ou `google`).
- E-mail: `EMAIL_GOOGLE_SCRIPT_URL`, `EMAIL_GOOGLE_SCRIPT_SEGREDO`, `EMAIL_REMETENTE`, `EMAIL_REMETENTE_NOME`.
- Push: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
- Pagamento (desligado; só "pagamento direto ao motorista"): `PAYMENT_PROVIDER` e as chaves do gateway quando houver.

## 3. Segredos do GitHub (Actions)

- Assinatura dos APKs (mesma chave da Google Play): `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  **Perder esta chave = não dá mais para atualizar o app na loja.** Guarde uma
  cópia do arquivo .jks e das senhas fora do GitHub.
- Testes no servidor real: `ADMIN_EMAIL`, `ADMIN_SENHA`, `OTP_CHAVE_TESTE`.
- `RENDER_DEPLOY_HOOK` (opcional): publica o servidor sozinho a cada mudança.
  Sem ele, a publicação é feita pelo conector do Render.
- `DATABASE_URL` (antigo): aponta para o banco velho; só a esteira
  `db-bootstrap` (que não se usa) lê.

## 4. Contas da Central

- **Dono**: vê todas as cidades e é o único que muda tarifas, cupons,
  comissão, limpeza de dados e a aparência do app.
- **Operador de cidade**: criado em Central → Cidades e equipe → Operador.
  Entra com senha provisória e é obrigado a trocar no primeiro acesso; até
  trocar, o servidor recusa o resto da Central. Vê só a cidade dele.
- **Duas etapas (Google Authenticator)**: Central → Configurações → Segurança.
  Ao ligar, aparecem 8 códigos de recuperação (cada um vale uma vez):
  anote em papel e guarde fora do celular.

## 5. Cópia do banco e restauração

- Todo dia às 03:23 (Brasília) a esteira **Cópia diária do banco** baixa todas
  as tabelas, compacta e **criptografa** com a chave pública
  `infra/copia-banco.age.pub`. A cópia fica 30 dias nos arquivos da execução.
- Só abre com a chave privada (`AGE-SECRET-KEY-1...`), que fica **somente**
  com o Evandro (arquivo do projeto). Sem ela, a cópia não serve para nada.

Para restaurar (só em caso de perda de dados):

1. GitHub → Actions → Cópia diária do banco → a execução do dia → Artifacts
   ("Arquivos") → baixar `copia-banco-<número>`.
2. Num computador com Python: `pip install pyrage` e
   `python3 scripts/restaurar-copia.py COPIA.json.gz.age CHAVE.txt > restaurar.sql`
   (CHAVE.txt = a chave privada).
3. Criar as tabelas no banco novo: pôr o endereço do banco novo no segredo
   `DATABASE_URL` do GitHub e rodar a esteira **Preparar o banco de dados**
   (`prisma db push` + `prisma/sql/post-init.sql`). Ela também cria as
   bandeiras de tarifa padrão; como o `restaurar.sql` pula o que já existe,
   confira Central → Tarifas depois da restauração.
4. Rodar o `restaurar.sql` no banco (Supabase → SQL Editor, ou `psql`).
   Linhas que já existem são puladas.
5. Trocar o `DATABASE_URL` no Render e publicar o servidor.
6. Rodar a esteira **Teste de ponta a ponta** para conferir.

Teste de restauração: precisa da chave privada do Evandro (pendente, ver
PENDENCIAS.md). Ninguém mais tem essa chave, de propósito.

## 6. App de outro operador

Ver `operadores/README.md` (script `scripts/novo-app.sh` e a esteira
**App de operador**).
