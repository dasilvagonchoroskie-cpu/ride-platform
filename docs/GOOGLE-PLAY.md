# Google Play — guia de publicação (atualizado em 26/11/2026)

| App | Nome na loja | Pacote (não muda depois do primeiro envio) |
|---|---|---|
| Passageiro | Fortaleza Move | `br.com.fortalezadigitalsecurity.move.passageiro` |
| Motorista | Fortaleza Move Motorista | `br.com.fortalezadigitalsecurity.move.motorista` |

A **Central** (`com.rideplatform.central_app`) fica fora da loja (só a equipe usa).

Quem faz: **[E]** Evandro · **[C]** Claude.

---

## 1. Conta e prazo

- Conta **pessoal**. Conta pessoal criada depois de 13/11/2023 só publica
  depois de um **teste fechado com pelo menos 12 testadores, inscritos sem
  parar por 14 dias**; depois o Google analisa o pedido de produção
  ([fonte](https://support.google.com/googleplay/android-developer/answer/14151465?hl=pt-BR)).
- Os 12 testadores: pessoas reais com conta Google (motoristas, família,
  amigos), que instalam pelo link do teste e usam o app nesses 14 dias.

## 2. Ordem no Play Console

1. **[E]** Criar os dois apps (Create app — "Criar app"): idioma Português
   (Brasil), tipo App, Grátis.
2. **[E+C]** Preencher **Conteúdo do app** (App content) com as respostas da
   seção 4.
3. **[E+C]** Preencher a **Página da loja** (Store listing) com a seção 3.
4. **[E]** Enviar o AAB primeiro no **Teste interno** (Internal testing).
   Aceitar a **assinatura de apps do Google Play** (Play App Signing).
5. **[E]** Abrir o **Teste fechado** (Closed testing) com os testadores.
6. **[E]** Depois dos 14 dias, pedir **acesso à produção**.

## 3. Página da loja

| O quê | Onde está |
|---|---|
| Ícone 512 × 512 | `apps/mobile_passenger/loja/icone-512.png`, `apps/mobile_driver/loja/icone-512.png` |
| Recurso gráfico 1024 × 500 | `apps/*/loja/recurso-grafico.png` |
| Textos curto e completo, categoria | `docs/loja/TEXTOS-DA-LOJA.md` |
| Capturas de tela (mínimo 2 por app) | ⏳ tirar no celular, sem dados de pessoas reais |
| E-mail de suporte | fortalezamovegtba@gmail.com |

## 4. Conteúdo do app

| Pergunta | Resposta |
|---|---|
| Política de privacidade | `https://api.fortalezadigitalsecurity.com.br/api/legal/privacidade` |
| Excluir a conta (link fora do app) | `https://api.fortalezadigitalsecurity.com.br/api/conta/exclusao` |
| Excluir a conta dentro do app | Passageiro: Conta → Excluir minha conta. Motorista: Menu → Cadastro → Excluir minha conta |
| Anúncios | Não tem |
| Público-alvo | 18 anos ou mais |
| Classificação indicativa (IARC) | Sem violência e sem jogos; usuários se comunicam; o app compartilha a localização |
| Acesso ao app (App access) | Exige login. Informar as contas de revisão (item 5) |
| Localização em segundo plano (`ACCESS_BACKGROUND_LOCATION`) | Não é pedida |
| Outras declarações (recursos financeiros, saúde, governo) | Conferir cada uma na tela; o dinheiro da corrida não passa pela plataforma |

### 4.1 Serviço em primeiro plano (Foreground service — "Serviço em primeiro plano")

A loja pede uma descrição e um **vídeo curto** para cada tipo
([fonte](https://support.google.com/googleplay/android-developer/answer/13392821)).
Textos em inglês, prontos para colar.

**Motorista — Location:**

> When the driver taps "Available", the app starts a foreground service with a
> persistent notification. It sends the driver's location so nearby ride
> requests can be offered and the passenger can see the car approaching. It
> keeps working with the screen off and stops when the driver goes offline.

Vídeo: ficar Disponível → mostrar o aviso fixo → apagar a tela → chegar um
chamado → ficar Offline e o aviso sumir.

**Passageiro — Data sync:**

> After the passenger requests a ride, a foreground service with a persistent
> notification keeps fetching the ride status from our server, so the passenger
> is alerted when a driver accepts, arrives, sends a message or the ride ends.
> It is started by the user's request and stops when the ride ends.

Vídeo: pedir corrida → minimizar → mostrar o aviso fixo → motorista aceita e
chega (avisos) → corrida termina e o aviso some.

Se o Google recusar o tipo "sincronização de dados" no passageiro, o plano B é
tirar esse serviço e usar só o aviso push (já ligado). Exige teste em celular
antes.

### 4.2 Tela cheia (Full-screen intent) e janela sobre outros apps (só motorista)

- Declarar que o uso é a **chamada de corrida** com tempo para aceitar. Não
  marcar o app como app de ligação ou de alarme. Para os demais apps, o
  Android 14+ não garante a permissão sozinho: o app confere e leva o
  motorista até o ajuste ([fonte](https://source.android.com/docs/core/permissions/fsi-limits)).
- **Aparecer sobre outros apps:** explicar na análise que serve para o chamado
  abrir por cima do GPS ou de outro app.

> Drivers are usually using a navigation app or have the phone locked. A new
> ride request has only a few seconds to be accepted, so the app shows a
> full-screen request with a swipe-to-accept button.

## 5. Contas para o Google testar

O código está pronto e **desligado por padrão** (variável `OTP_CONTAS_REVISAO`
no servidor, formato `e-mail=código,e-mail=código`). Vale só para os e-mails
da lista, só para passageiro e motorista, nunca para a Central. Falta criar as
duas contas (passageiro e motorista aprovado, com veículo), gravar a variável
no servidor e copiar e-mail e código para o formulário. O valor nunca vai para
o repositório. **[C com o OK do E]**

## 6. Segurança dos dados (Data safety — rascunho para conferir)

| Dado | Coleta? | Para quê | Observação |
|---|---|---|---|
| Nome, e-mail, telefone | sim | conta e contato na corrida | Durante a corrida e por até 24 h depois, uma ponta pode ver o telefone da outra |
| CPF, data de nascimento | sim | identidade e maioridade | |
| CNH, documentos, certidão de antecedentes e fotos do carro (motorista) | sim | aprovação do cadastro | |
| Foto de perfil | opcional | identificação | |
| Localização precisa | sim | achar motorista, rota, acompanhar a corrida | TomTom calcula rota e endereço |
| Endereços (origem, destino, salvos) | sim | pedir e repetir corridas | |
| Mensagens da corrida | sim | conversa entre as pontas | |
| Histórico de corridas e entregas | sim | recibo, suporte, segurança | |
| Contatos de emergência (opcional) | sim | avisar em caso de SOS | |
| Quem recebe a entrega (nome, telefone) | sim, só em entregas | entregar e confirmar | |
| Identificador de aviso (push) | sim | avisos da corrida | Google Firebase |
| Dados de pagamento | **não** | pagamento direto ao motorista | |

Marcar: dados criptografados no envio — **sim**; a pessoa pode pedir a
exclusão — **sim**. Prestadores de serviço (hospedagem, e-mail, aviso, mapa)
tratam os dados em nome da plataforma; conferir na tela a definição de
"compartilhamento" do Google antes de responder.

## 7. Exigências técnicas

| O quê | Situação |
|---|---|
| Pacote **AAB** assinado | a esteira `android-apks.yml` gera junto com o APK |
| Alvo **Android 16 (API 36)** ([fonte](https://developer.android.com/google/play/requirements/target-sdk)) | a esteira confere no APK pronto |
| Bibliotecas nativas alinhadas em **16 KB** | a esteira confere no APK pronto |
| Assinatura: a chave dos APKs vira a **chave de envio**; o Google guarda a chave do app | guardar uma cópia do `.jks` fora do GitHub |
| Número da versão | sobe sozinho a cada montagem |

## 8. Verificação de desenvolvedor do Android

Desde **30/09/2026**, no Brasil, apps instalados pelas lojas participantes
precisam estar registrados em nome de um desenvolvedor verificado
([fonte](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)).
Conferir no Play Console o registro dos dois pacotes e também o da **Central**
(fora da loja), com a impressão digital da assinatura
([perguntas](https://developer.android.com/developer-verification/guides/faq)).

## 9. Depois (não trava a publicação)

- Conta de organização, quando houver CNPJ (pede número D-U-N-S).
- Domínio próprio da marca, para trocar de servidor sem atualizar o app.
- Revisão dos Termos e da Política por um advogado.
