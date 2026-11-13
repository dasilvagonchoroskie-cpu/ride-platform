# Teste de rua com dois celulares (riscos 1 a 4 do PENDENCIAS.md)

> Critérios de aprovação, pré-condições resumidas e a ficha para anotar falhas: `docs/TESTE-DE-RUA-FICHA.md`.

Precisa: 2 celulares Android com internet (4G de verdade, não só Wi-Fi),
APKs da montagem mais nova, uma conta de **passageiro** num e uma conta de
**motorista aprovado** no outro (carro em uso, saldo na carteira, cidade
Goiatuba), e a Central aberta (celular, tablet ou computador). Leva uns 40
minutos. Anote o horário de cada passo: com o horário eu acho tudo nos
registros do servidor.

Antes de sair: Central → Configurações → linha **Mapa** (toque em
**Verificar de novo**) e anote os números do mês (buscas, endereços, rotas,
lugares, imagens). No fim, anote de novo: a diferença
dividida pelo número de corridas é a média real de chamadas à TomTom por
corrida.

## Risco 1 — chamado com a tela apagada e com o app fechado

1. Motorista: abrir o app, ficar **Disponível**, apagar a tela (botão de
   ligar) e deixar o celular parado na mesa.
2. Passageiro: pedir uma corrida (destino a uns 2 km).
3. Esperado: o celular do motorista **acende e toca** em até 15 s, com a
   oferta na tela. Anote quantos segundos levou.
4. Recusar, e repetir com o app do motorista **fechado** (tirar da lista de
   apps recentes, sem sair da conta).
5. Esperado: chega o aviso (som/vibração) e, tocando nele, abre a oferta.
6. Se não tocar em algum caso: anote o modelo do celular e se a economia de
   bateria estava ligada.

## Risco 2 — aviso push no aparelho

1. Com o motorista disponível e a tela apagada, a Central manda uma corrida
   para ele (Despacho → escolher o motorista).
2. Esperado: aviso no celular do motorista.
3. Passageiro com o app em segundo plano: quando o motorista aceitar, chega o
   aviso "motorista a caminho"; quando tocar em **Cheguei**, outro aviso.
4. Anote os que não chegaram.

## Risco 3 — GPS na rua, taxímetro e posição

1. Corrida de verdade, com destino, de uns 3 a 5 km, com pelo menos uma
   parada de 2 minutos no meio (semáforo ou estacionar).
2. Passageiro: o carro deve andar no mapa enquanto vem buscar (não pular de
   rua em rua) e a hora de chegada deve baixar.
3. Durante a viagem: o taxímetro dos dois celulares deve subir junto (o do
   passageiro pode atrasar uns segundos).
4. No fim: compare o km do taxímetro com o km do odômetro do carro (anote os
   dois) e o valor cobrado com o estimado no pedido.
5. Repita uma corrida **sem destino** (opção "Ir sem destino") e uma com
   **parada extra** ("Adicionar parada").

## Risco 4 — mapa num celular de verdade em Goiatuba

1. Passageiro: fechar o app, abrir de novo no 4G e contar quantos segundos
   até aparecerem as ruas (anote). Repetir 3 vezes.
2. Motorista: o mesmo, com o GPS desligado por 10 s e depois ligado.
3. Mexer o mapa rápido com o dedo: as ruas não devem ficar em branco por mais
   de 2 s.
4. Busca de destino: digite 5 ruas de Goiatuba (das 20 que você vai mandar)
   e veja se a primeira opção é a certa.

## Requisição 1 (11/11/2026) — roteiro em aparelho real

Marque cada linha **ok** ou **falhou** (com o horário). Teste de emulador
não vale para esta lista.

### A. Atualizar sem deslogar (cofre do celular)

1. Com a versão antiga instalada e **logada** (passageiro e motorista),
   instale o APK novo **por cima** (não desinstale).
2. Esperado: abre já logado, sem pedir código.
3. Feche o app, tire da lista de recentes, abra de novo: continua logado.

### B. Aparelhos e desconectar (Central)

1. Entre com a **mesma conta de passageiro** em dois celulares.
2. Central → Passageiros → a conta → **Aparelhos**: devem aparecer **dois**
   celulares, cada um com o modelo (ex.: "Xiaomi Redmi 12").
3. Toque **Desconectar** em um deles. Esperado: em até 1 minuto (no próximo
   uso) ele volta para a tela de entrada; o outro continua usando normal.
4. Repita com o motorista: o motorista desconectado sai do ar se não tiver
   outro aparelho aberto.

### C. GPS

1. Passageiro e motorista com GPS ligado, ao ar livre: o ponto azul deve
   ficar na rua certa em até 10 s.
2. Desligue o GPS 10 s e ligue: o app avisa e volta sozinho.

### D. Notificações — passageiro

Faça três vezes, com o app **aberto**, **em segundo plano** (botão início) e
**fechado** (tirado dos recentes):

1. Motorista aceita a corrida → chega "motorista a caminho".
2. Motorista toca **Cheguei** → chega o aviso.
3. Anote quais não chegaram e em quantos segundos chegaram.

### E. Chamadas — motorista (tela apagada e app fechado)

Igual ao Risco 1 acima: disponível, **tela apagada**; depois **app fechado**.
O celular deve acender e tocar em até 15 s.

### F. Categoria (sem ligar nada na cidade)

O Conforto continua **desligado** para os passageiros. Para conferir a
separação use só o carro do motorista de teste:

1. Central → Motoristas → o motorista de teste → bloco **Categoria do
   veículo** → "Recebe chamados de" → **Conforto**.
2. Motorista disponível perto do passageiro. Passageiro pede **Popular**.
3. Esperado: o motorista do carro Conforto **não** recebe a chamada.
4. Volte o carro para **Popular**: pedindo de novo, agora ele recebe.

### G. Taxímetro e navegação

1. Corrida real de 3 a 5 km com uma parada de 2 minutos (Risco 3 acima).
2. Botões **Google Maps** e **Waze** na corrida do motorista: abrem a rota
   até o passageiro e depois até o destino.
3. Anote km do taxímetro × odômetro e o valor final × estimado.

### H. Carteira depois da corrida

1. Anote o saldo do motorista antes.
2. Depois da corrida: Carteira → a taxa da Central aparece e o saldo baixou
   exatamente essa taxa (taxa sobre o **valor final**, não o estimado).

### I. Busca e rota em Goiatuba

Digite 5 endereços reais de Goiatuba (rua e número) e 3 lugares conhecidos
(mercado, posto, hospital). A primeira opção deve ser a certa; anote os que
vierem errados.

### J. Visual

Ícones, a **bandeira do Brasil** na tela do telefone e o botão
**Google Maps** do motorista numa linha só. Print de qualquer coisa estranha.

### K. Autorizações em outras marcas

Se tiver acesso a um Samsung, Motorola ou outro: abrir **Autorizações**,
tocar em cada **Abrir ajuste** e dizer se abriu a tela certa.

## Requisição de continuidade (11/11/2026) — recuperação de contas

Use a versão nova dos três aplicativos. Precisa de dois celulares (o seu e o
emprestado servem) e de uma conta de passageiro de teste com e-mail que você
consiga abrir.

### L. Trocar a senha derruba o outro celular na hora

1. Entre com a mesma conta de passageiro nos dois celulares (A e B).
2. No A: Conta → Meus dados → **Alterar senha**.
3. No B, em seguida (sem esperar): abra qualquer tela que busca no servidor
   (Histórico, por exemplo). Esperado: o B volta para a tela de entrar.
4. O A continua usando normalmente.
5. Confira o e-mail da conta: chegou o **Aviso de segurança** com o horário
   certo de Brasília. No B pode chegar o mesmo aviso como notificação.

### M. "Esqueci minha senha" deixa só o celular que recuperou

1. Entre nos dois celulares de novo.
2. No B: sair → **Esqueci minha senha** → código do e-mail → senha nova.
3. No A: deve voltar para a tela de entrar na próxima ação.

### N. Trocar o e-mail e o telefone (passageiro)

1. Meus dados → mude o **E-mail** → **Salvar**: aparece **Confirmar e-mail
   novo** e o código chega no e-mail **novo**. Digite → salvo.
2. O e-mail antigo recebe o aviso "O e-mail da sua conta... foi trocado".
3. Logo em seguida, **Trocar telefone**: deve recusar ("48 horas depois da
   troca do e-mail").
4. Numa conta sem e-mail: **Trocar telefone** → deve pedir para cadastrar o
   e-mail antes (o código **não** aparece na tela).

### O. Recuperar acesso pela Central (só o dono)

1. Central → Passageiros → a conta de teste → **Recuperar acesso**.
2. Deixe uma conferência desmarcada → **Liberar acesso** → deve dizer "Não
   liberado" e o celular da pessoa continua conectado.
3. Marque todas → e-mail novo → **Liberar**: o celular da pessoa sai da conta
   na hora; ela entra pelo código que chega no e-mail novo.
4. Num operador de cidade, o botão não aparece (e o servidor recusa).

### P. Duas etapas (só quando você estiver com o seu celular)

Siga `docs/DUAS-ETAPAS-DONO.md`. Depois teste: sair → **Esqueci a senha** na
Central → código do e-mail + senha nova → a Central **pede o código do Google
Authenticator** antes de entrar. Sem o código, a senha antiga continua valendo.

## Rodada de 13/11/2026 — novos roteiros (Q a V)

Valem para a versão que sair depois do merge autorizado. Os passos Q a S e V
não acionam motorista real. **T e U só com sua autorização expressa** (chave
geral do Comércio e Entrega ligada numa cidade de teste).

### Q. Login da Central no cofre do celular
1. Com a Central **antiga** instalada e logada, instale a nova **por cima**.
2. Esperado: abre já logada, sem pedir senha nem código. Feche e abra de novo: continua logada.
3. Deixe a Central parada com a tela apagada por mais de 20 minutos (o acesso vence em 15) e abra:
   deve continuar logada (renovação automática), sem voltar à tela de entrada.
4. Com o app fechado, peça um cadastro de motorista novo: o aviso da Central chega (o vigia nativo
   usa o mesmo login do cofre).
5. **Sair** na Central e abrir de novo: pede o login. Entrar de novo funciona.

### R. Login que se renova sozinho (Motorista e Passageiro)
1. Entre no app, deixe 20 minutos sem usar (tela apagada) e abra: continua logado.
2. Repita com o app tirado dos recentes.
3. Falha = voltou para a tela de entrada sem você ter saído. Anote o horário.

### S. Mapa operacional e Motos na Central
1. Mapa da tela inicial: motorista online perto aparece em até 15 s; ao desligar o app dele, vira
   cinza (offline) na última posição.
2. Cortar a internet da Central por 30 s: aparece "Sem conexão agora: mostrando os últimos dados."; ao
   voltar, o aviso some sozinho em até o próximo ciclo.
3. Filtros (Carros, Motocicletas, Entregas do Comércio, Veículos livres, SOS): só mudam o que se vê.
4. Menus **Carros** e **Motos**: suspender e reativar um veículo de teste; o motorista dele sai e volta
   do ar conforme a situação.
5. Ao sol: as cores (azul-ciano do Comércio, vermelho do SOS) e os filtros são legíveis.

### T. Entrega manual lançada pelo motorista (SÓ COM AUTORIZAÇÃO)
Pré-condição: Entrega ligada na cidade de teste, chave geral do Comércio ligada **por você**, uma
loja de teste aprovada, só o motorista de teste online.
1. Motorista → **Lançar entrega manualmente** → buscar a loja → conferir o perfil → dados da encomenda,
   de quem recebe e destino → preço oficial → confirmar.
2. Esperado: aparece em Central → Entregas com a origem "motorista" e o nome de quem lançou.
3. Tocar duas vezes em confirmar, ou cortar a rede e tentar de novo: só **uma** entrega nasce.

### U. App do Comércio, corrida de entrega completa (SÓ COM AUTORIZAÇÃO)
Guia: `docs/COMERCIO-TESTE.md`, Teste 3. Pré-condições iguais às de T.
1. Loja pede entrega (carro ou moto, só o que a Central liberou) → confere o preço → confirma.
2. O motorista de teste recebe, aceita, vai à loja, coleta, entrega. A loja vê cada etapa (a cada
   ~8 s) e o mapa com o motorista.
3. A Central mostra a entrega no mapa (azul-ciano) e em Entregas, com o valor cobrado igual ao confirmado.
4. A loja cancela uma entrega ainda sem motorista: some do motorista de teste.

### V. Conexão e processo (Motorista, Passageiro, Central)
1. Com corrida em andamento, ligue o **modo avião** por 30 s e desligue: o app volta sozinho, sem sair da
   corrida e sem duplicar aviso.
2. Troque de app e volte (botão início → outro app → voltar): tudo continua.
3. "Forçar parada" do app nas configurações do Android e abrir de novo: continua logado; o motorista
   volta a ficar disponível só se tocar em disponível.
4. Motorista parado e disponível por 3 minutos: continua recebendo chamado (a posição é reenviada a
   cada 45 s pelo serviço nativo).

## O que me mandar

Os horários, os segundos de cada passo, os km (taxímetro x odômetro), os
números do Uso do mapa antes e depois, e print de qualquer tela estranha.
