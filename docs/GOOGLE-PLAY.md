# Google Play — o que falta para publicar (Etapa 7, 30/10/2026)

Vale para o **passageiro** (`br.com.fortalezamov.passageiro`) e o
**motorista** (`br.com.fortalezamov.motorista`). A **Central**
(`com.rideplatform.central_app`) fica fora da loja (só a equipe usa).

Quem faz: **[E]** Evandro · **[C]** Claude · **[S]** sócio/advogado.
Situação: ✅ pronto · ⏳ falta.

---

## 1. Conta de desenvolvedor (antes de tudo)

| # | O quê | Quem | Situação |
|---|---|---|---|
| 1.1 | **CNPJ** da empresa que vai ser dona dos apps | E | ⏳ |
| 1.2 | **Número D-U-N-S** da empresa (grátis, pela Dun & Bradstreet; pode levar **até 28 dias**). Nome e endereço precisam ser **iguais** aos do CNPJ | E | ⏳ |
| 1.3 | Conta no **Google Play Console** como **organização** (taxa única de US$ 25), com o D-U-N-S, e-mail e telefone de contato da empresa e o site (o domínio do item 2) | E | ⏳ |
| 1.4 | Verificação de identidade do Google (documento do responsável) | E | ⏳ |

Por que organização: a conta **pessoal** criada depois de 13/11/2023 precisa
de um teste fechado com 12 testadores por 14 dias antes de publicar; a de
organização não. E a loja, os contratos e a cobrança ficam no nome da
empresa (docs/CONTAS.md).

## 2. Domínio próprio apontando para o Render

| # | O quê | Quem | Situação |
|---|---|---|---|
| 2.1 | Registrar o domínio (ex.: `fortalezamove.com.br`) no **Registro.br**, já no CNPJ. Tem taxa anual: confira o valor na tela antes de pagar | E | ⏳ |
| 2.2 | No Render: serviço `fortaleza-mov-backend` → Settings ("Configurações") → Custom Domains ("Domínios próprios") → `api.<domínio>`. O Render emite o certificado HTTPS sozinho | C (com o domínio pronto) | ⏳ |
| 2.3 | No Registro.br: DNS → registro **CNAME** `api` → `fortaleza-mov-backend.onrender.com` (eu mando o passo a passo com os valores na hora) | E | ⏳ |
| 2.4 | Apps passam a chamar `https://api.<domínio>` (com o endereço do Render de reserva) e o teste de ponta a ponta roda no endereço novo | C | ⏳ |

Por que: hoje os apps chamam `fortaleza-mov-backend.onrender.com`. O Render
não transfere serviço entre contas; com domínio próprio, dá para trocar de
conta ou de servidor **sem atualizar o app na loja**.

## 3. Páginas públicas que a loja pede

| # | O quê | Quem | Situação |
|---|---|---|---|
| 3.1 | **Política de privacidade** em página de internet: `<servidor>/api/legal/privacidade` (com o domínio: `https://api.<domínio>/api/legal/privacidade`) | C | ✅ no ar, conferida em todo teste de ponta a ponta |
| 3.2 | **Excluir a conta pela internet** (a loja exige link fora do app): `<servidor>/api/conta/exclusao` | C | ✅ no ar, conferida em todo teste de ponta a ponta |
| 3.3 | Excluir a conta **dentro do app** (Conta → Excluir minha conta) | C | ✅ |
| 3.4 | Revisão do texto dos Termos e da Política (inclui o item 7-A de entregas, **TEXTO PROVISÓRIO**) e nome/CNPJ/endereço do controlador dos dados | S | ⏳ |

## 4. Ficha da loja (Store listing — "Página da loja")

| # | O quê | Quem | Situação |
|---|---|---|---|
| 4.1 | Nome no celular e na loja (até 30 letras): "Fortaleza Move" e "Fortaleza Move Motorista" | C | ✅ (a esteira confere o nome dentro do APK) |
| 4.2 | Ícone 512 × 512 | C | ⏳ sai do símbolo novo (`loja/icone-512.png`, gerado pelo `scripts/gerar-icones.py`) |
| 4.3 | **Recurso gráfico** (feature graphic) 1024 × 500, obrigatório | C | ⏳ faço com o símbolo novo e a cor #0070B8 |
| 4.4 | Capturas de tela do celular (mínimo 2 por app) | C | ⏳ tiro no Android de teste do GitHub, sem dados de pessoas reais |
| 4.5 | Descrição curta (até 80 letras) e completa (até 4.000) | C escreve, E aprova | ⏳ |
| 4.6 | Categoria: **Mapas e navegação** (passageiro e motorista) | E aprova | ⏳ |
| 4.7 | E-mail de suporte (obrigatório; de preferência no domínio próprio) | E | ⏳ |

## 5. Conteúdo do app (App content — "Conteúdo do app")

| # | O quê | Quem | Situação |
|---|---|---|---|
| 5.1 | **Segurança dos dados** (Data safety): rascunho das respostas na seção 8 | C rascunho, S confere | ⏳ |
| 5.2 | **Classificação indicativa** (questionário IARC): sem violência, sem jogos; marca que usuários se comunicam e que o app **compartilha a localização** | E responde (eu digo o que marcar) | ⏳ |
| 5.3 | **Público-alvo**: 18 anos ou mais (a conta já exige 18 anos) | E | ⏳ |
| 5.4 | **Anúncios**: "não tem anúncios" | E | ⏳ |
| 5.5 | **Acesso ao app** (App access): o Google precisa entrar no app. Eu preparo **uma conta de revisão** do passageiro e uma do motorista (aprovado, com carro e saldo) que mostram o código na tela; você só copia os dados para o formulário | C | ⏳ |
| 5.6 | **Serviço em primeiro plano** (Foreground service): o motorista usa *localização* (receber chamados e seguir a corrida com a tela apagada); o passageiro usa *sincronização de dados*. A loja pede descrição e um **vídeo curto** mostrando o uso | C escreve e grava no Android de teste; E envia | ⏳ |
| 5.7 | Localização em segundo plano | — | ✅ não pedimos `ACCESS_BACKGROUND_LOCATION` (só o serviço em primeiro plano, com aviso fixo na tela) |
| 5.8 | Outras declarações que aparecerem (ex.: recursos financeiros, saúde, governo): todas "não" | E | ⏳ |

## 6. Exigências técnicas

| # | O quê | Quem | Situação |
|---|---|---|---|
| 6.1 | Pacote da loja **AAB** assinado | C | ✅ a esteira gera junto com o APK (passageiro e motorista) |
| 6.2 | Alvo **Android 16 (API 36)** — obrigatório para app novo e atualização desde 31/08/2026 | C | ✅ a esteira confere no APK pronto |
| 6.3 | Bibliotecas nativas alinhadas em **16 KB** | C | ✅ a esteira confere no APK pronto |
| 6.4 | Assinatura: a mesma chave dos APKs vira a **chave de envio** (upload key); o Google guarda a chave do app (Play App Signing). Segredos `ANDROID_*` do GitHub + cópia do .jks fora do GitHub | C | ✅ (perder a chave = não atualiza mais) |
| 6.5 | **Desligar o modo teste do código de entrada** (`OTP_DEBUG_RETURN` no Render; estava ligado desde o começo, sem SMS). Ligado, conta só com telefone (sem e-mail) recebe o código **na tela**: na loja, qualquer pessoa entraria nessas contas. Antes de desligar: e-mail funcionando e as contas de revisão do item 5.5 | C | ⏳ **obrigatório antes de publicar** |
| 6.6 | Primeira versão pelo **teste interno** (Internal testing — "Teste interno", até 100 pessoas), depois produção | E + C | ⏳ |

## 7. Verificação de desenvolvedor do Android (regra nova de 2026)

- Desde **30/09/2026**, no Brasil, apps instalados pelas lojas participantes
  (Google Play, Samsung Galaxy Store, Xiaomi e outras) precisam estar
  registrados em nome de um desenvolvedor verificado. Os apps publicados
  pela conta do Play Console entram nesse registro.
- **APK instalado direto** (como os que eu mando aqui no chat): segundo a
  página de perguntas do Google, a regra **ainda não vale** ("won't apply to
  your app yet"); a expansão para o mundo todo está prevista para **2027**.
- **A fazer [C+E]:** quando a conta do Play Console existir, registrar
  também o pacote da **Central** (`com.rideplatform.central_app`, fora da
  loja) e, se houver, os pacotes dos apps de outros operadores, cada um com a
  impressão digital da assinatura. Sem isso, em 2027 esses APKs só instalam
  pelo modo avançado do celular (ativa uma vez e espera 1 dia) ou por cabo
  (adb).

## 8. Rascunho da "Segurança dos dados" (para o sócio conferir)

| Dado | Coleta? | Para quê | Compartilha com terceiros? |
|---|---|---|---|
| Nome, e-mail, telefone | sim, obrigatório | conta, contato na corrida | não (o motorista vê o primeiro nome do passageiro e vice-versa, dentro do serviço) |
| CPF, CNH, fotos de documentos e do carro (motorista) | sim, obrigatório para motorista | aprovação do cadastro | não |
| Localização precisa | sim | buscar motorista, rota, acompanhar a corrida; motorista: receber chamados | **TomTom** recebe os pontos para calcular rota e endereço (sem nome nem telefone) |
| Endereços (origem, destino, salvos, recentes) | sim | pedir e repetir corridas | TomTom (busca do endereço) |
| Histórico de corridas e entregas | sim | recibo, suporte, segurança | não |
| Dados de quem recebe a entrega (nome, telefone) | sim, só em entregas | entregar e confirmar com o código | não |
| Identificador do aparelho para aviso (push) | sim | avisos de corrida | Google Firebase (só entrega o aviso) |
| Dados de pagamento | **não** (pagamento direto ao motorista; nenhum cartão no app) | — | — |

Marcar também: dados **criptografados no envio** (HTTPS) — sim; o usuário
pode **pedir a exclusão** — sim (no app e pela página do item 3.2).

---

Fontes (consultadas em 30/10/2026):
[Exigência de API alvo (Google)](https://support.google.com/googleplay/android-developer/answer/11926878) ·
[Verificação de desenvolvedor — perguntas (Google)](https://developer.android.com/developer-verification/guides/faq) ·
[Verificação de desenvolvedor — junho/2026 (blog Android)](https://android-developers.googleblog.com/2026/06/android-developer-verification.html) ·
[D-U-N-S grátis (Dun & Bradstreet)](https://www.dnb.com/en-us/smb/duns/get-a-duns.html) ·
[Domínio próprio no Render](https://render.com/docs/custom-domains) ·
[Certificado HTTPS automático no Render](https://render.com/docs/tls) ·
conta de organização e 12 testadores: fonte em docs/CONTAS.md.
