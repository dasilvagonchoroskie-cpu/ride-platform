# Entregas de encomendas — Fortaleza Move

Fase 1 feita em 30/10/2026. **Desligada em todas as cidades** até o dono ligar.

## Como funciona (Fase 1)

1. **Ligar numa cidade:** Central → escolha a cidade no topo → menu
   **Entregas** → toque na cidade → **Entrega ligada nesta cidade** → escolha
   **Carro**, **Moto** ou **Os dois** → **Salvar**. Só o dono grava; o
   operador da cidade vê.
2. **Tarifa:** Central → **Tarifas** → **Entrega** (bandeirada, km incluso,
   valor por km, mínima, comissão; diurna e noturna). Com a cidade escolhida
   no topo, o valor vale só nela. Começa com os mesmos valores do Popular:
   **ajuste antes de ligar**. A "Entrega" nunca aparece como opção de corrida
   nem como categoria de carro.
3. **Cliente (app do passageiro):** botão **Entrega de encomenda** na tela
   inicial (só aparece onde está ligada) → coleta (começa onde ele está),
   entrega, o que vai ser levado, nome e telefone de quem recebe, forma de
   pagamento, "Li as regras" → **Ver o preço** → **Pedir entrega**.
   - Depois do pedido aparece o **código de 4 números** e o botão **Mandar o
     código pelo WhatsApp** para quem recebe. (Ainda não temos envio de SMS.)
4. **Motorista:** chamado marcado **ENTREGA** com o item → aceita → **Cheguei**
   → **CONFIRMAR COLETA** → **CONFIRMAR ENTREGA**, que pede o código. O app do
   motorista **nunca recebe o código**: ele pede a quem recebe.
   - Código errado: mostra quantas tentativas restam. Depois de 5 erros, só a
     Central libera (menu Entregas → **Liberar código**, depois de ligar para
     quem recebe).
5. **Pagamento:** direto ao motorista (dinheiro, Pix ou cartão na maquininha
   dele); a comissão sai da carteira pré-paga, igual às corridas.
6. **Central:** menu **Entregas** mostra os pedidos da cidade com o status
   (procurando, indo coletar, na coleta, levando, entregue, cancelada), quem
   pediu, quem recebe, o código e o valor.

**Custo da TomTom por entrega:** o mesmo caminho da corrida (orçamento 1 rota,
motorista 2, cliente 1 = 4 rotas). O teste de ponta a ponta mede no servidor
real a cada rodada.

## Texto provisório (Termos item 7-A e Política de Privacidade)

Está no ar marcado como **TEXTO PROVISÓRIO — em revisão jurídica**. Pontos que
o texto já traz como sugestão: itens proibidos, peso e tamanho (carro até 10 kg
no porta-malas; moto até 5 kg e 40 × 40 × 40 cm), embalagem, descrição
verdadeira, código de entrega, ninguém para receber, dano ou extravio, e os
dados de quem recebe na Política.

## O que o Evandro e o sócio precisam decidir

1. **Itens proibidos:** a lista do texto está boa? Falta algo (comida
   perecível, medicamentos comuns, documentos originais, eletrônicos)?
2. **Peso e tamanho:** 10 kg de carro e 5 kg / 40 cm de moto servem?
3. **Dano ou extravio:** a plataforma cobre algum valor? Qual o **limite** (ex.:
   até R$ 200)? O motorista responde até quanto? Vai ter **seguro**?
4. **Valor declarado:** pedir que o cliente diga o valor do item? Recusar acima
   de um valor?
5. **Ninguém para receber:** quanto tempo o motorista espera? Devolve ao cliente
   e cobra a volta inteira ou metade?
6. **Cancelamento depois da coleta:** quem paga e quanto?
7. **Conferência de quem recebe:** só o código basta, ou também nome/documento?
8. **Quem paga:** só quem pede (hoje) ou também quem recebe (Fase 2)?
9. **Idade mínima de quem pede** (hoje: 18 anos, igual à conta).
10. **Guarda dos dados de quem recebe:** pelo prazo do histórico da corrida
    (hoje) ou menos?
11. **Tarifa inicial da Entrega** em cada cidade (hoje igual ao Popular).
12. **Contrato TomTom:** a entrega usa o mesmo plano da corrida (ver
    docs/TOMTOM-TERMOS.md).

## Fase 2 (só plano, nada feito)

### Foto de comprovante — fora do banco (limite de 500 MB)

- **Onde guardar:** **Cloudflare R2** (armazenamento de arquivos). Plano grátis
  com 10 GB e sem custo de saída (download). Alternativa: Supabase Storage
  (grátis até 1 GB, mas conta separada do banco atual).
- **Tamanho:** o app reduz a foto para no máximo 1280 px e qualidade 70% →
  **até ~300 KB** por foto. O servidor recusa acima de 500 KB.
- **Prazo:** apaga sozinho depois de **90 dias** (regra automática do R2); o
  banco guarda só o endereço da foto.
- **Quem vê:** o cliente, o motorista da entrega e a Central, por link com
  login que vence em minutos.
- **Custo:** 10 GB ≈ 33 mil fotos de 300 KB → **R$ 0** no plano grátis. Acima
  disso, US$ 0,015 por GB por mês; baixar a foto não paga nada (preços na
  página oficial https://developers.cloudflare.com/r2/pricing/, atualizada em
  26/10/2026). Precisa de conta na Cloudflare (o Evandro cria) — nada pago sem
  aprovação.

### Pagamento na entrega (quem recebe paga)

- Campo novo "quem paga": quem pede ou quem recebe.
- Com "quem recebe", o motorista cobra na entrega; o app mostra o valor na
  tela do código. Risco: quem recebe se recusar a pagar — definir regra
  (cobra de quem pediu?).

### Entregas agendadas

- Usar o agendamento das corridas (30 min a 7 dias). O servidor já procura
  motorista 10 min antes. Falta: liberar `scheduledFor` para entrega e mostrar
  na lista de agendadas.

### Mais de uma parada

- Cada parada com o seu destinatário e o seu código (tabela de paradas da
  entrega). O motorista confirma uma por uma. Preço: soma dos trechos, como
  as paradas da corrida.
