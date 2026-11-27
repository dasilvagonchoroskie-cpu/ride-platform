# Contas, chaves e restauração (etapa 7)

Este arquivo fica no repositório (hoje **público**; ver PENDENCIAS.md para
torná-lo privado): aqui só vão os NOMES das
contas e das variáveis, e onde cada coisa fica. Nenhuma senha, chave ou
endereço de banco entra aqui. Os valores ficam no `api.env` do servidor, nos segredos do
GitHub e no cofre de senhas do Evandro — nunca no arquivo do projeto nem no
chat (regra de 30/10/2026).

## 1. Serviços

| Serviço | Para quê | Onde ficam as credenciais | Dono |
|---|---|---|---|
| GitHub (este repositório) | código, esteiras (APK, testes, cópia do banco) | Settings → Secrets and variables → Actions | Evandro |
| Servidor (VPS) | servidor (NestJS) | `api.env` no servidor | Evandro |
| Supabase | banco PostgreSQL + PostGIS | `DATABASE_URL` no `api.env` do servidor | Evandro |
| TomTom | mapa, busca de endereço e rotas | `TOMTOM_API_KEY` no `api.env` do servidor (nunca no app nem no código) | Evandro |
| Firebase (projeto fortaleza-mov) | aviso push | `FCM_*` no `api.env` do servidor; configuração pública em `infra/firebase-apps.b64` | Evandro |
| Gmail (Apps Script) | e-mail com o código de entrada | `EMAIL_GOOGLE_SCRIPT_URL` e `EMAIL_GOOGLE_SCRIPT_SEGREDO` no `api.env` do servidor | Evandro |
| Google Cloud (opcional) | Google Maps, se um dia ligar | `infra/mapas.b64` (chave restrita aos apps) e `GOOGLE_MAPS_API_KEY` | Evandro |
| Google Play (quando publicar) | loja; também registra os pacotes fora da loja (Central, operadores) na verificação de desenvolvedor do Android | conta de **organização** no CNPJ (ver `docs/GOOGLE-PLAY.md`) | empresa |
| Registro.br (quando registrar) | domínio próprio (`api.<domínio>` → servidor VPS) | conta do titular (CNPJ) | empresa |

## 2. Variáveis do servidor (`api.env` no servidor)

- Banco e cache: `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- Login: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `OTP_*`.
  - **Atenção:** o segredo do autenticador (duas etapas da Central) é guardado
    cifrado com uma chave tirada do `JWT_ACCESS_SECRET`. Se esse valor for
    trocado, os códigos do Google Authenticator param de valer: entre com um
    **código de recuperação**, desligue e ligue de novo as duas etapas.
  - `OTP_CHAVE_TESTE`: só os testes automáticos usam, e **somente em contas de teste**
    (endereços `@teste.fortalezamov.com.br`). Não entra na Central nem em conta de verdade.
  - `OTP_DEBUG_RETURN`: modo teste (código na tela para conta sem e-mail; ligado
    desde o começo, sem SMS). **Desligar antes da loja** (`docs/GOOGLE-PLAY.md`, item 6.5).
  - `OTP_CONTAS_REVISAO`: contas de revisão da loja (Google Play), `e-mail=código` separados por
    vírgula. **Desligada por padrão (vazia).** Só e-mail da lista, só entrada por e-mail, só
    passageiro/motorista (nunca ADMIN), sem envio de e-mail, com o limite de 6 pedidos/hora e as
    5 tentativas do código normal. Valor só no `api.env`, nunca no repositório (`docs/GOOGLE-PLAY.md`, 5.5).
- Mapa: `TOMTOM_API_KEY` (busca, endereço e rota; nunca sai do servidor),
  `TOMTOM_API_KEY_MAPA` (opcional: chave só das imagens do mapa, a única que
  chega aos celulares; sem ela, vale a `TOMTOM_API_KEY`), `TOMTOM_COTA_MES`,
  `MAPA_PROVEDOR` (`tomtom` ou `google`), `ROTA_NOS_MAIS_PROXIMOS` (quantos
  motoristas mais perto têm a chegada medida pela rua; padrão 3; 0 desliga).
- E-mail: `EMAIL_GOOGLE_SCRIPT_URL`, `EMAIL_GOOGLE_SCRIPT_SEGREDO`, `EMAIL_REMETENTE`, `EMAIL_REMETENTE_NOME`.
- Push: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
- Pagamento (desligado; só "pagamento direto ao motorista"): `PAYMENT_PROVIDER` e as chaves do gateway quando houver.

## 3. Segredos do GitHub (Actions)

- Assinatura dos APKs (mesma chave da Google Play): `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  **Perder esta chave = não dá mais para atualizar o app na loja.** Guarde uma
  cópia do arquivo .jks e das senhas fora do GitHub.
- Testes no servidor real: `ADMIN_EMAIL`, `OTP_CHAVE_TESTE` (desde 26/11/2026 a chave não
  entra na conta da Central; as esteiras que dependiam disso não funcionam mais). `ADMIN_SENHA` não é usado por nenhuma esteira desde 30/10/2026: pode ser apagado.
- Teste de restauração (só quando for testar): `COPIA_BANCO_CHAVE` (chave privada da cópia)
  e `BANCO_TESTE_URL` (banco de teste vazio).
- `DATABASE_URL` (antigo): aponta para o banco velho; só a esteira
  `db-bootstrap` (que não se usa) lê. Pode ser apagado (passo a passo, item 6.2).

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

- Desde 26/11/2026 a cópia diária é feita **pelo próprio servidor**,
  criptografada, e guardada fora dele em local privado. O que está abaixo
  vale para as cópias antigas, feitas pela esteira **Cópia diária do banco**
  (guardadas 30 dias, chave pública `infra/copia-banco.age.pub`).
- Só abre com a chave privada, que fica **somente** com o Evandro (cofre de
  senhas ou papel; nunca no arquivo do projeto nem no chat). Sem ela, a cópia
  não serve para nada.
- **Troca da chave em 30/10/2026**: a chave antiga tinha sido escrita no
  arquivo do projeto. Par novo gerado; `infra/copia-banco.age.pub` é a pública
  nova. Cópias feitas antes de 30/10 só abrem com a chave antiga; as novas, só
  com a nova.

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
5. Trocar o `DATABASE_URL` no `api.env` do servidor e reiniciar a API.
6. Rodar a esteira **Teste de ponta a ponta** para conferir.

Teste de restauração: precisa da chave privada do Evandro (pendente, ver
PENDENCIAS.md). Ninguém mais tem essa chave, de propósito.

## 6. App de outro operador

Ver `operadores/README.md` (script `scripts/novo-app.sh` e a esteira
**App de operador**).

## 7. Quem é o titular de cada conta e como passar para a empresa

Hoje tudo está no nome do Evandro (pessoa física, sem CNPJ). Quando a empresa
existir, o que está marcado **Sim** precisa ir para o nome dela: é o que a
loja, os contratos e a cobrança exigem, e o que não pode ficar preso a uma
pessoa. Nenhuma senha vai aqui.

| Serviço | Titular hoje | Como compartilhar / passar | Nome da empresa? |
|---|---|---|---|
| **Google Play** (ainda não criada) | — | Criar já como **conta de organização** (CNPJ + número D-U-N-S, grátis, até ~30 dias; verificação do Google 1–3 semanas). Conta de organização não precisa do teste fechado com 12 testadores por 14 dias que vale para conta pessoal criada depois de 13/11/2023. Dá para transferir app entre contas depois (pedido no Play Console; o Google pode pedir documentos), mas é mais demorado. A chave de assinatura (segredos `ANDROID_*`) vai junto e não pode se perder. | **Sim, obrigatório** |
| **TomTom** (mapa, busca, rota) | conta do Evandro | Não precisa transferir: a empresa cria a conta dela, gera a chave (e a chave só do mapa), troca `TOMTOM_API_KEY` (e `TOMTOM_API_KEY_MAPA`) no `api.env` do servidor e apaga a chave antiga. Uso comercial pede plano pago (cláusula 2.2, ver docs/TOMTOM-TERMOS.md): o contrato deve ser da empresa. Cada operador com servidor próprio usa a chave dele. | **Sim** |
| **Servidor (VPS)** | contrato do Evandro na Integrator Host | A plataforma já roda no servidor novo (Debian); o Render não é mais usado. A API fica em api.fortalezadigitalsecurity.com.br (domínio próprio), então trocar de servidor não exige atualizar os apps: basta apontar o DNS. Confirmar com a Integrator Host como passar o contrato para a empresa. | **Sim** |
| **Supabase** (banco) | organização do Evandro | Convidar: Organization → Team → Invite. Passar: Project Settings → General → **Transfer project** (dono da organização de origem e membro da de destino; sem integração com GitHub nem log drains; no plano grátis, máximo de 2 projetos por organização). O endereço do banco não muda. | **Sim** |
| **Firebase** (aviso push, projeto fortaleza-mov) | conta Google do Evandro | ⚙ Project settings ("Configurações do projeto") → Users and permissions ("Usuários e permissões") → Add member ("Adicionar membro") → Owner ("Proprietário"). A conta da empresa aceita o convite; depois o Evandro pode sair. O projeto é o mesmo: nada muda nos apps. | **Sim** |
| **GitHub** (código e esteiras) | conta pessoal `dasilvagonchoroskie-cpu` | Compartilhar: Settings → Collaborators ("Colaboradores") → Add people. Passar: criar uma organização da empresa (grátis) → no repositório Settings → General → Danger Zone ("Zona de perigo") → Transfer ownership ("Transferir"). Depois conferir os segredos das Actions. | **Sim** |
| **Domínio** | a API roda em `api.fortalezadigitalsecurity.com.br`. `fortalezadigitalsecurity.com.br` é da marca de desenvolvimento do Evandro | Registrar o domínio do app já no CNPJ. Se for registrado no CPF antes: Registro.br → transferência de titularidade (documento gerado no site, assinado pelo gov.br, análise em 2 dias úteis; .com.br pode passar de CPF para CNPJ). | **Sim** |
| **Gmail** (e-mail com o código de entrada) | Gmail do Evandro, pelo Apps Script | Conta Gmail não se transfere. A empresa cria o e-mail dela (de preferência no domínio próprio), refaz o Apps Script nessa conta (pasta `scripts/email-gmail`) e troca `EMAIL_GOOGLE_SCRIPT_URL`, `EMAIL_GOOGLE_SCRIPT_SEGREDO`, `EMAIL_REMETENTE` no `api.env` do servidor. | **Sim** (quem envia) |
| **Google Cloud** (chave do Google Maps, opcional) | Evandro | Só se for usar o Google Maps: projeto na conta da empresa, chave restrita aos pacotes + SHA-1. A chave antiga que esteve no repositório deve ser apagada (PENDENCIAS.md). | Sim, se usar |
| **Chave privada da cópia do banco** | só o Evandro | Não se compartilha por chat nem e-mail. Guardar em papel/cofre; para o teste de restauração, vai como segredo do GitHub (`COPIA_BANCO_CHAVE`). | Guardar com o responsável legal |

Fontes: 
[Supabase – transferir projeto](https://supabase.com/docs/guides/platform/project-transfer) ·
[Firebase – membros do projeto](https://support.google.com/firebase/answer/7000272) ·
[Google Play – conta de organização e 12 testadores](https://ontest.app/blog/personal-vs-organization-google-play-account-12-testers) ·
[Transferência de app entre contas da Play](https://adapty.io/docs/transfer-apps) ·
[Registro.br – titularidade](https://www.homehost.com.br/blog/dominio/transferencia-de-dominio-no-brasil/) ·
[TomTom – gestão de chaves](https://docs.tomtom.com/platform/documentation/api-best-practices/api-key-management-best-practices)

