# PENDÊNCIAS — Fortaleza Move

Atualizado em 30/10/2026 (madrugada): pedido "PLATAFORMA: FORTALEZA MOVE" de 29/10 20:23 — segurança do repositório, nome, categorias por cidade, TomTom, cidades, ícones, contas, teste de rua e passo a passo (montagem 265).
Este arquivo diz o que foi **verificado com teste real**, o que é **só teste automático/simulado** e o que **não existe ou não tem teste**.

Legenda: **[REAL]** testado de verdade (servidor real, Android de teste ou esteira) · **[AUTO]** só teste automático, com dados de mentira · **[SEM TESTE]** existe, mas nada testou · **[NÃO EXISTE]** ainda não foi feito.

---

## 1. Resultado real dos testes (30/10/2026)

| O quê | Resultado | Onde ver |
|---|---|---|
| Servidor: compilação TypeScript | 0 erros | rodado aqui (`tsc --noEmit`) |
| Servidor: testes automáticos | **79 passaram, 0 falharam** (13 grupos; novos: categorias e tarifas por cidade, semente, chegada, busca de cidade nova, chave só do mapa) | rodado aqui (`jest`) |
| App do passageiro: análise / testes de tela | nenhum problema / **71 passaram, 0 falharam** (12 pulados: fotos) | logs/analyze-mobile_passenger.txt, logs/test-mobile_passenger.txt |
| App do motorista: análise / testes de tela | nenhum problema / **70 passaram, 0 falharam** (7 pulados) | logs/analyze-mobile_driver.txt, logs/test-mobile_driver.txt |
| Central: análise / testes de tela | nenhum problema / **48 passaram, 0 falharam** (1 pulado) | logs/analyze-central_app.txt, logs/test-central_app.txt |
| Teste de ponta a ponta no servidor real | **308 etapas, 0 falhas** (30/10, ~03:50 UTC, servidor feb95bc com as categorias no ar) | logs/teste-ponta-a-ponta.txt |
| Os testes novos acharam e foram corrigidos | cartão da categoria estourava 15 px no passageiro; "Pedidos de categoria" da Central dava erro (setState com Future); "Abrir cidade nova" não achava cidade fora da região; teste da taxa do chamado esperava 8% fixo (a noturna hoje é 10%) | commits dcb9ad3, a3c0f3e, a4e5db4 |
| Cópia do banco antes de publicar a semente das categorias | feita (esteira "Cópia diária do banco", 30/10 03:26 UTC, sucesso) | logs/copia-banco.txt |
| APKs 265 | ver a seção 4 (conferidos por dentro antes da entrega) | rodado aqui |

Ambiente: **não existe Flutter nem Android SDK no computador do Claude** (a internet daqui bloqueia o download). Tudo que é Flutter roda no GitHub Actions.

---

## 2. Riscos em ordem (maior primeiro)

1. **Chamado com a tela apagada / app fechado — [AUTO].** Falta o teste de rua (roteiro em docs/TESTE-DE-RUA.md).
2. **Notificação push chegando no celular — [SEM TESTE] no aparelho.** O servidor aceita a chave do Firebase (conferido em todo ponta a ponta).
3. **GPS na rua, taxímetro e posição — [AUTO].** Falta corrida de rua.
4. **Mapa num celular de verdade em Goiatuba — [SEM TESTE].** Medido só no Android de teste (seção 7).
5. **Cota grátis da TomTom é POR MÊS — [REAL no servidor].** A página oficial (docs.tomtom.com/pricing) diz "Free monthly requests per API": imagens 200 mil, rota 20 mil, endereço 20 mil, endereço pelo ponto 20 mil, lugares 2,5 mil por mês. O servidor conta por mês, **avisa a 70%** (Central → Configurações → Mapa: "ATENÇÃO: passou de 70%" e registro no servidor) e entra no **modo economia a 80%**. Ressalva: o contrato (cláusula 8.5) fala em "free daily limits" que vencem no fim do mês — página e contrato não batem (docs/TOMTOM-TERMOS.md, para o sócio). A TomTom também limita ~10 imagens por segundo para a chave inteira (os apps vão no ritmo). **Chamadas por corrida completa (medido 2 vezes no servidor real): 11** — 1 busca, 1 endereço pelo GPS, 1 lugar, 8 rotas (1 no orçamento, 1 na chegada do motorista mais perto, 5 dos apps nas etapas da corrida, 1 na conferência do fim). Média real na rua: medir no teste de rua (docs/TESTE-DE-RUA.md).
6. **Repositório público — pendente do Evandro.** Varredura de 1.087 commits: a chave da TomTom e as senhas do banco **nunca** foram commitadas; ficaram no histórico a chave antiga do Google Maps (a chave antiga do Google Maps (Lord Perfumaria), apagar) e a senha inicial do administrador (trocar se ainda for ela). Passo a passo: docs/PASSO-A-PASSO-EVANDRO.md, item 1.
7. **Chave da TomTom chega ao celular de quem está logado — [REAL].** Agora dá para usar uma **segunda chave só de imagens do mapa** (`TOMTOM_API_KEY_MAPA`, [AUTO] testado no servidor; falta o Evandro criar a chave no painel da TomTom). A TomTom não manda alerta de uso: o alerta é o nosso (70%).
8. **Termos da TomTom sobre guardar dados — decisão do sócio.** O servidor **não guarda mais nada** da TomTom (busca, endereço, rota, imagens: [AUTO] + [REAL] no ponta a ponta). O celular guarda só as imagens, pelo prazo do cabeçalho da TomTom (**medido: max-age=86400, 1 dia**). Ficam para o sócio: endereços gravados nas corridas (11.6.1), plano grátis só para avaliação (2.2) e a atribuição fixa (17.3). Trechos com link: docs/TOMTOM-TERMOS.md.
9. **Verificação em duas etapas da Central — [REAL], mas DESLIGADA na conta do dono.** Passo a passo: docs/PASSO-A-PASSO-EVANDRO.md, item 3.
10. **Restauração da cópia do banco — [SEM TESTE] num banco de verdade.** A esteira nova "Testar a restauracao da copia" restaura num banco de teste vazio e confere tabela por tabela; a parte de abrir a cópia e montar o SQL foi testada aqui com uma chave descartável. Falta o Evandro pôr os 2 segredos e apertar o botão (item 4 do passo a passo).
11. **Categorias Conforto e Premium — [REAL], mas DESLIGADAS.** Entraram desligadas em todas as cidades (senão o passageiro escolhe e ninguém atende). Ligar por cidade quando houver carro aprovado (docs/CIDADE-NOVA.md, passo 10). Observação: às 00:32 de 30/10 a sua conta salvou a categoria CARRO pela Central (app 256) e o nome voltou de "Popular" para "Carro" e a taxa noturna ficou 10%; se quiser "Popular", é só trocar o nome em Tarifas.
12. **Endereço do servidor é o do Render.** Antes de publicar na loja: domínio próprio apontando para o Render, para poder trocar de conta sem atualizar o app (docs/CONTAS.md, seção 7).
13. **Google Play — criar como conta de organização (CNPJ + D-U-N-S).** Conta pessoal nova exige teste fechado com 12 testadores por 14 dias; a de organização não (docs/CONTAS.md).
14. **Dependências do servidor:** zod (alta, só no zod 4), @nestjs/core e file-type (moderadas, só com o Nest 11). Troca grande: **só com o seu OK**.
15. **Pagamento com cartão — [NÃO EXISTE], por decisão.** "Meus cartões" mostra só "Em breve".
16. **Banco grátis de 500 MB com as fotos dentro.** Aperta perto de 250–300 motoristas com documentos.
17. **E-mail só pelo Gmail (~100 por dia).**
18. **Ícones novos — não recebidos.** O gerador agora faz Android (adaptativo, redondo), **iPhone/iPad (18 tamanhos + 1024 da App Store, sem transparência)** e o 512 da Google Play, e avisa imagem fora do padrão (testado aqui com uma imagem boa e uma ruim: 6 avisos na ruim). A esteira do iPhone usa os ícones quando existirem.
19. **20 ruas de Goiatuba para o teste da busca — não recebidas.**
20. **Destinos recentes:** hoje ficam no servidor, só da conta (cada usuário tem o seu, nunca compartilhado). Você escreveu "o histórico do usuário fica somente no aplicativo do usuário": se for para ficar **só no celular** (e sair do servidor), me confirme — muda o que foi feito na etapa 4.

---

## 3. Situação do pedido de 29/10 20:23

| Item | Situação |
|---|---|
| 1. Segurança do repositório | Varredura FEITA (achados no risco 6); esteiras econômicas FEITAS (APK só pelo botão, só valida o app que mudou, 144 arquivos de APK antigos apagados); **tornar privado: falta o Evandro** (passo a passo) |
| 2. Nome "Fortaleza Move" | FEITO: 120 trocas em 69 arquivos; pacotes mantidos `br.com.fortalezamov.*` (sua escolha) |
| 3. Categorias de veículo | FEITO e **[REAL]** no ponta a ponta: Popular/Conforto/Premium; figura, descrição, lugares, tarifa base, km, minuto, mínima, multiplicador, ligada — por cidade; motorista pede no cadastro do carro e a Central aprova/recusa; recebe só da categoria aprovada; passageiro vê preço e chegada de cada uma; preço pela rota medida uma vez (com destino, sem destino e com parada); corridas antigas continuam (CARRO). Telas: **[AUTO]** |
| 4. TomTom | FEITO: cota mensal; alerta 70% e economia 80%; busca com 3 letras úteis e 500 ms (já existia), só na região, sem chamada de detalhes; servidor sem guardar nada; motorista mais perto por linha reta e rota pela rua só nos 3 mais perto (**[AUTO]** teste despacho.spec; no ponta a ponta, com 1 motorista perto, foi 1 rota de chegada); 11 chamadas por corrida; chave própria por operador (variável do servidor de cada um) + chave só do mapa; trechos do contrato para o sócio (docs/TOMTOM-TERMOS.md) |
| 5. Cidade nova pela Central | FEITO: docs/CIDADE-NOVA.md com as 6 cidades; busca de cidade no Brasil todo só para o dono (**[REAL]**: "Teutonia RS" achada a 1.296 km) |
| 6. Ícones | gerador PRONTO (Android + iPhone + loja, com avisos); esperando os PNG |
| 7. docs/CONTAS.md | FEITO: tabela de titular, como passar/compartilhar e o que precisa ir para o nome da empresa |
| 8. Teste de rua | roteiro FEITO: docs/TESTE-DE-RUA.md (riscos 1 a 4 + categorias + contagem da TomTom) |
| 9. Passo a passo do Evandro | FEITO: docs/PASSO-A-PASSO-EVANDRO.md (restauração, TomTom, 2 etapas, ícones/ruas, privado) |
| zod 4 / Nest 11 | NÃO mexido (esperando o seu OK) |

---

## 4. APKs 265 (30/10/2026) — conferidos por dentro

| App | Pacote | Versão | Conferido |
|---|---|---|---|
| Passageiro | br.com.fortalezamov.passageiro | 1.0.265 | alvo 36, mínimo 24; mesma assinatura (SHA-1 F2:70:E9:8C:C6:A8:F0:1D:31:4D:9E:3A:45:AE:42:77:3A:8D:96:C3); mesmas permissões da 256; chave da TomTom **não** está dentro; telas novas compiladas ("Chega em ~", "Sem carro perto", "lugares") |
| Motorista | br.com.fortalezamov.motorista | 1.0.265 | idem; telas novas ("Mudar categoria", "Categoria do carro", "Pedir à Central") |
| Central | com.rideplatform.central_app | 1.0.265 | idem; telas novas ("Pedidos de categoria", "Voltar ao padrão nesta cidade", "Ligada nesta cidade") |

Instalam por cima da 256. A 256 continua nos Releases do GitHub (dá para voltar).

---

## 5. Etapa 2 — Mapa e desempenho (medições reais, 29/10/2026)

**Como foi medido.** Esteira nova "Medir o mapa" (`.github/workflows/medir-mapa.yml`): monta o app com um medidor (só nessa montagem; o APK normal não tem), instala num **Android 14 de teste (emulador do GitHub)** com internet de verdade e o servidor real, com contas de teste criadas e apagadas pela própria esteira. Três aberturas por app: **r1** primeira abertura com o GPS sem sinal nos primeiros 8 s (como dentro de casa); **r2** e **r3** reaberturas com o GPS respondendo e as ruas já guardadas. Os tempos são desde que o app começou a rodar (mesma régua antes e depois). Relatórios e fotos da tela: `logs/medir-mapa/antes`, `depois`, `depois-final`.

**Limites da medição (o que NÃO foi medido):** é um emulador nos EUA, não um celular no Brasil; o GPS do emulador é mais lento e instável que o de um celular; a rede é a do GitHub. Serve para comparar antes e depois, não como tempo exato no celular do passageiro. As fotos da tela ficaram como prova visual; a contagem automática pelas fotos não ficou confiável e não foi usada nos números.

### Passageiro — tempo até o mapa aparecer
| Abertura | Antes (montagem 237) | Depois (montagem 241) |
|---|---|---|
| r1 primeira, GPS sem sinal 8 s | 13,8 s (ruas não carregaram em 20 s) | **3,0 s** no centro da cidade do cadastro; ruas 4,3 s; carros 4,5 s |
| r2 reabertura | 12,5 s; ruas 13,8 s; carros 14,0 s | **2,0 s**; ruas 2,6 s; carros 2,8 s |
| r3 reabertura | 7,1 s; ruas 7,6 s; carros 7,7 s | **1,3 s**; ruas 1,9 s; carros 2,5 s |

### Motorista — tempo até o mapa aparecer
| Abertura | Antes | Depois |
|---|---|---|
| r1 primeira, GPS sem sinal | não abriu em 20 s ("Localizando você") | não abriu em 20 s (igual: sem nenhuma posição no celular, espera o GPS) |
| r2 | 3,0 s | 12,5 s (nesta rodada o Android não tinha posição guardada e o GPS do emulador demorou) |
| r3 | 3,4 s | 2,4 s |
O motorista já abria com a última posição do Android; agora também com a guardada pelo próprio app. **Melhora não comprovada no motorista**: as diferenças vieram do GPS do emulador.

### Central — tempo até o mapa aparecer
| Abertura | Antes | Depois |
|---|---|---|
| r1 | 2,4 s; ruas 5,7 s; carros 6,6 s | 2,3 s; ruas 3,1 s; carros 4,2 s |
| r2 | 2,5 s; ruas 3,8 s; carros 4,8 s | 1,3 s; ruas 2,1 s; carros 2,7 s |
| r3 | 1,7 s; ruas 3,6 s; carros 4,1 s | 1,1 s; ruas 1,8 s; carros 2,3 s |
A Central **não mudou nesta etapa** (já não esperava o GPS); a diferença é variação da rede.

### Causas encontradas
1. **GPS (a maior):** o passageiro só mostrava o mapa depois do GPS responder (até 15 s de espera, com a tela "Localizando você"). Medido: o mapa aparecia junto com o GPS, de 7 a 14 s. **Corrigido:** o mapa abre na hora na última posição deste celular (guardada pelo app ou a do Android); na primeira vez, sem posição nenhuma, abre no centro da cidade do cadastro (vem do servidor). Aviso "Atualizando sua localização…" até o GPS chegar; aí o mapa vai até o lugar certo e os carros são buscados de novo. O embarque nunca usa posição velha sem avisar: antes de calcular a corrida o app espera o GPS até 10 s; sem GPS e só com o centro da cidade, não deixa pedir.
2. **Imagens do mapa (OSM público):** chegam 0,5 a 3,3 s depois do mapa; na primeira abertura, numa rodada, não chegaram em 6 s. Sem garantia e fora da política de uso comercial. **Encaminhado:** Google Maps pronto, esperando a chave; OSM fica de reserva (troca pelo servidor).
3. **Chamadas ao servidor:** 0,2 a 2,2 s cada (Central `/admin/eu` até 3 s na primeira). Não seguram o mapa (já eram feitas depois).
4. **Marcadores:** já entravam depois do mapa; carros aparecem 0,2 a 1,1 s depois das ruas.

### Pendente da etapa 2
- (Atualizado 29/10 tarde) O mapa passou para a TomTom (seção 5). A chave do Google Maps virou opcional: com ela, o servidor pode trocar para o Google (`MAPA_PROVEDOR=google`) sem reescrever as telas.
- ~~Primeira abertura do motorista num celular sem posição nenhuma ainda espera o GPS~~ — corrigido na montagem 256 (seção 6): abre na última posição conhecida pelo servidor ou no centro da cidade dele.
- Medir num celular de verdade em Goiatuba (teste de rua).

---

## 6. Troca do mapa para a TomTom (29/10/2026, montagens 242–244)

**Pedido do Evandro (10:59):** mapa, busca e rotas pela TomTom; interface MapProvider; economia (3+ letras, 500 ms, guardado, 1 rota por corrida, guardado de imagens); posição pelo FusedLocationProvider; contador diário local; contingência para 429/403 com "Abrir no Google Maps"; tirar o OpenStreetMap público. Respostas: APIs web da TomTom dentro dos apps Flutter atuais (não o SDK nativo Kotlin), busca e rota pelo servidor, chave entregue pelo servidor a quem está logado.

**Onde está a chave:** só na variável `TOMTOM_API_KEY` do Render e no `.env` do computador do Claude (fora do Git: `.env` e `local.properties` estão no `.gitignore`). Conferido: não está no código, nos testes, nos registros, no histórico do Git nem dentro dos APKs 242 e 244.

| O quê | Situação |
|---|---|
| Busca de destino pela TomTom (servidor real) | **[REAL]** resultados para "Avenida Brasilia" em Goiatuba. Desde 29/10 (noite) a busca fica só na região de operação (pedido do Evandro); "Abrir cidade nova" na Central procura no Brasil todo |
| Endereço do ponto pelo GPS | **[REAL]** "Rua Minas Gerais" |
| Rota pelas ruas | **[REAL]** 24 pontos, 1.375 m |
| Imagens do mapa com login / sem login | **[REAL]** com login vem o endereço TomTom 512 px; sem login: 401 |
| /app/config público sem a chave | **[REAL]** |
| Contador da plataforma (Central) | **[REAL]** o teste lê o uso do dia; passageiro não vê |
| Página pública de acompanhar | **[REAL]** abre sem login (imagens pela rota do próprio servidor) |
| Busca só com 3 letras úteis, 500 ms | **[AUTO]** testes dos 3 apps (o servidor não guarda mais nada desde 29/10, noite) |
| Contador local do dia e modo economia a 80% | **[AUTO]** |
| Contingência (endereço em texto + "Abrir no Google Maps") | **[AUTO]** tela e aviso no mapa; o 429 de verdade não foi provocado (gastaria a cota) |
| Rota 1 vez por etapa (refaz só fora do caminho, com limite) | **[AUTO]** só por leitura do código e testes existentes; falta corrida de rua |
| FusedLocationProvider no passageiro | **[SEM TESTE]** em aparelho (montado e analisado) |
| Imagens da TomTom aparecendo no Android de teste | **[REAL no emulador]** medição "tomtom" (logs/medir-mapa/tomtom): as ruas da TomTom aparecem nos 3 apps (fotos da tela do passageiro e do motorista) |
| Atribuição "© TomTom" visível | corrigido: nos mapas de tela cheia ela ficava atrás do painel de baixo (vista nas fotos da medição); agora vai no alto, à esquerda (abaixo do taxímetro nas telas de corrida). Conferido nas fotos das telas (esteira "Fotos dos apps") |

**Medição "tomtom" (mesma esteira e mesma régua da seção 4; tempo desde o início do app):**

| App | Abertura | Mapa na tela | Primeira imagem de ruas | Carros |
|---|---|---|---|---|
| Passageiro | r1 (1ª, GPS sem sinal) | 2,8 s | 4,1 s | 3,5 s |
| Passageiro | r2 | 2,3 s | 3,0 s | 3,4 s |
| Passageiro | r3 | 1,0 s | 2,0 s | 2,3 s |
| Motorista | r1 (sem posição nenhuma, espera o GPS) | 10,6 s | 11,7 s | — |
| Motorista | r2 | 2,0 s | 2,8 s | — |
| Motorista | r3 | 2,2 s | 3,5 s | — |
| Central | r1 | 1,7 s | 4,0 s | 4,5 s |
| Central | r2 | 1,9 s | 2,9 s | 3,4 s |
| Central | r3 | 1,5 s | 2,5 s | 3,2 s |

Comparando com o OpenStreetMap (montagem 241, seção 4): passageiro 4,3 / 2,6 / 1,9 s até as ruas → 4,1 / 3,0 / 2,0 s com a TomTom (praticamente igual; na 1ª abertura a TomTom ainda pede o endereço das imagens ao servidor, /geo/mapa, 0,2 a 1 s). Central 3,1 / 2,1 / 1,8 s → 4,0 / 2,9 / 2,5 s (um pouco mais lenta nesta rodada; a rede do emulador varia ~1 s entre rodadas). Motorista: a 1ª abertura sem posição nenhuma continuava esperando o GPS (corrigido na 256, seção 6).

**APKs antigos (até 241):** não acham mais o endereço das imagens no /app/config e continuam com o mapa antigo (OpenStreetMap) até instalar a 244.

---

## 7. Primeira abertura do mapa mais rápida (pedido do Evandro, 29/10 14:28: "achei até que não ia aparecer as ruas")

**Causa achada:** a chave da TomTom aceita só ~10 pedidos de imagem por segundo para a plataforma inteira (e 5 por segundo de busca e de rota). A abertura do mapa pedia ~20 imagens de uma vez: as que passavam do limite voltavam 429 ("devagar") e ficavam em branco até mexer no mapa. No servidor, um 429 parava a busca até a meia-noite. No motorista, na primeira vez num celular sem posição nenhuma, o app ficava em "Localizando você…" até o GPS responder (20 s ou mais dentro de casa).

**O que mudou:**
- Apps: só as imagens da tela (~6 em vez de ~20); no máximo 6 baixando juntas e 8 novas por segundo; 429/502/503/504 esperam e tentam de novo (até 4 vezes); um fornecedor de imagens só para todos os mapas; o endereço das imagens (/geo/mapa) que falha tenta de novo em 2, 4, 8, 16 e 30 s (antes: 10 min sem ruas).
- Servidor: fila de 4 pedidos por segundo para busca e rota; 429 espera e tenta de novo e não para mais nada; 403 pausa 30 min.
- Motorista: o cadastro (/drivers/me) traz a última posição que o servidor conhece e o centro da cidade dele; o mapa abre ali e vai para a posição certa quando o GPS chega.

**Medição (Android de teste com a rede limitada a um 4G fraco: 6 Mbit/s, 100–250 ms; tempo desde o início do app):**

| App | Abertura | Antes (244) | Depois (código da 256, medição "4g-final") |
|---|---|---|---|
| Passageiro | 1ª abertura (instalado agora, GPS sem sinal 8 s) | mapa 4,9 s; 1ª rua 6,9 s | **mapa 3,1 s; todas as ruas da tela 4,4 s; 6 imagens, 0 respostas 429** (rodada anterior: 2,8 s / 3,9 s) |
| Passageiro | reaberturas | ruas 3,8 s; na 3ª abertura as ruas **não carregaram em 20 s** | ruas **1,8 s e 2,3 s** |
| Motorista | 1ª abertura (GPS não respondeu nos 20 s) | ficava em "Localizando você…" até o GPS (9,7 s numa rodada; **mais de 20 s** em outra) | **mapa 2,7 s; todas as ruas da tela 3,8 s; 0 respostas 429** — mesmo sem o GPS (foto da tela: ruas de Goiatuba) |
| Motorista | reaberturas | ruas 2,0 s e 2,4 s | ruas 3,2 s e 2,5 s (igual: variação da rede) |

Limites: emulador nos EUA, não celular em Goiatuba; serve para comparar antes x depois.

---

## 8. Etapas 3 a 8 (29/10/2026, tarde e noite)

| O quê | Situação |
|---|---|
| **Etapa 3** — corrida sem destino (taxímetro; o app mostra que o valor é ESTIMADO) | **[REAL]** servidor (preço sem destino, recusa sem marcar a opção) + **[AUTO]** tela |
| Parada extra (até 2) no caminho e no preço | **[REAL]** servidor (a distância aumenta com a parada) + **[AUTO]** |
| "Escolher no mapa" e "Ir sem destino" na busca do destino | **[AUTO]** |
| Busca com token de sessão e fonte da busca por cidade (Central → Cidades) | **[REAL]** servidor + **[AUTO]** |
| Endereços salvos (Casa, Trabalho) no servidor | **[REAL]** |
| **Etapa 4** — destinos recentes vêm do servidor, só da conta; lixeira apaga no servidor e só depois muda a tela; "Apagar histórico de destinos" | **[REAL]** servidor + **[AUTO]** tela (sem rede, nada muda) |
| **Etapa 5** — "Meus cartões" só com "Em breve"; nenhum campo de cartão; pagamento direto ao motorista | **[AUTO]** (o teste pegou o selo "EM BREVE" estourando a largura num celular estreito: corrigido) |
| **Etapa 6** — aparência pela Central: nome, cor, logo e faixa de aviso do app do passageiro (Central → Configurações → App do passageiro → Aparência do app; só o dono grava) | **[REAL]** servidor (operador não muda; app recebe nome e cor; logo público) + **[AUTO]** telas dos 2 apps. A Central ainda não mexeu: o app continua igual até alguém salvar |
| App de outro operador (scripts/novo-app.sh + esteira "App de operador") | **[REAL na esteira]** (exemplo compilado e conferido por dentro) |
| Ícones (scripts/gerar-icones.py) | pronto e testado com um símbolo de exemplo; **esperando os arquivos do Evandro** |
| **Etapa 7** — verificação em duas etapas da Central (Google Authenticator) | **[REAL]** na conta do operador de teste: liga com o código, a senha sozinha não entra, código repetido e desafio alterado são recusados, código de recuperação vale uma vez, desliga |
| Senha provisória do operador (troca obrigatória no 1º acesso; até trocar o servidor recusa a Central) | **[REAL]** |
| Isolamento entre cidades pelo endereço direto (operador de outra cidade não abre motorista nem carteira pelo id) | **[REAL]** |
| Itumbiara na janela "Novo operador" (6 cidades, rolagem) | **[AUTO]** teste de tela rola até Itumbiara e escolhe |
| Documentação de contas e restauração | feita: docs/CONTAS.md (sem nenhuma senha; o repositório é público) |
| Dependências | qs corrigido (6.16.1); sobram 4 que exigem troca grande |
| **Etapa 8** — iPhone | **[REAL na esteira]** os 3 apps compilam (sem assinar) |
