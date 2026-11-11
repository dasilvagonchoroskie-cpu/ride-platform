# Teste de rua com dois celulares (riscos 1 a 4 do PENDENCIAS.md)

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

## O que me mandar

Os horários, os segundos de cada passo, os km (taxímetro x odômetro), os
números do Uso do mapa antes e depois, e print de qualquer tela estranha.
