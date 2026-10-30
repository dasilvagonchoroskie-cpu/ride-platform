# TomTom — trechos do contrato sobre guardar dados (para o sócio advogado)

Contrato: **TomTom Portal Terms & Conditions** —
https://docs.tomtom.com/legal/terms-and-conditions (lido em 29/10/2026).
Os trechos estão em inglês, como no original. **Não é parecer jurídico**: é
só o texto e o que o sistema faz, para comparar. A decisão é do sócio.

## Trechos

**Definição de "Results":**
> "Results" means any information delivered by the Maps APIs in response to a
> request and which, without limitation may include geocodes and reverse
> geocodes, map data tiles and route information.

**11.4 (guardar / cache):**
> The caching or storing of any Results shall be prohibited except that you
> may cache Results delivered by the Licensed Products provided that:
> 11.4.1. such Results may only be cached in clients where the control
> headers are present in the Result; 11.4.2. such Results must not be cached
> in clients for longer than the maximum age period indicated in such cache
> control headers; 11.4.3. where supported in the Permitted Solution, client
> caches should be invalidated when a content update has occurred. Nothing
> under Clause 11.4 entitles any form of caching for the purpose of scaling
> results to serve multiple clients or users.

**11.6.1 (base de dados derivada):** proíbe
> use the content delivered by the Licensed Products for the creation of any
> secondary or derived database populated wholly or partially with your
> data…

**2.1 e 2.2 (licença):** a licença paga ("In consideration of you paying the
License Fees…") é para a "Permitted Solution"; a licença grátis
("royalty-free") é "for Evaluation Use only", e "Evaluation Use" é
"internal evaluation and testing by you of the Licensed Products".

**8.5 (cota):**
> Free daily limits which are included under a Subscription Plan, to the
> extent they are unused, do not carry forward and shall expire at the end of
> each month.

A página de preços (https://docs.tomtom.com/pricing) fala em cota **por mês**
("Free monthly requests per API"); o contrato fala em "limites diários" que
vencem no fim do mês. O servidor segue a página (decisão do Evandro,
29/10/2026): conta por mês, alerta a 70% e modo economia a 80%.

**17.3 (atribuição):** não remover o logo/aviso de direitos; quando não vier
automático, usar a "TomTom Copyright API".

## O que o sistema faz hoje (30/10/2026)

| Item | Como está | Prova |
|---|---|---|
| Servidor guarda busca, endereço ou rota para reaproveitar entre usuários | **Não guarda nada** (tirado em 29/10/2026) | teste automático `tomtom.spec.ts` ("nada fica guardado no servidor": a mesma busca vai de novo à TomTom) |
| Página pública de acompanhar a corrida | busca a imagem na TomTom a cada pedido e repassa ao navegador o cabeçalho de cache que a própria TomTom mandou (sem cabeçalho: "no-store") | código `acompanhar-imagens.ts`; teste de ponta a ponta |
| Celular guarda as imagens do mapa | só no próprio celular, pelo prazo do cabeçalho da TomTom (medido: `cache-control: max-age=86400`, 1 dia) | teste de ponta a ponta (seção "cabeçalhos de cache") |
| Rota medida no orçamento e reaproveitada no pedido | o servidor **não guarda**: devolve ao celular um valor assinado (distância e tempo, válido 20 min, só para aqueles pontos) que o próprio celular manda de volta | `cotacao.ts` e teste `cotacao.spec.ts` |
| Histórico de destinos | cada usuário tem o seu; nunca é compartilhado entre usuários (decisão do Evandro, 29/10/2026) | teste de ponta a ponta (etapa 4) |
| Endereços gravados nas corridas, endereços salvos e destinos recentes | ficam no banco, ligados à conta e à corrida (precisam ficar para recibo, histórico e suporte) | — **ponto para o sócio avaliar frente à 11.6.1** |
| Plano | grátis (só "Evaluation Use", cláusula 2.2) com passageiros reais | — **ponto para o sócio avaliar; o uso comercial pede plano pago** |
| Atribuição | texto "© TomTom" fixo no mapa | — ponto da 17.3 (não usa a Copyright API) |

## Perguntas para o sócio

1. Guardar o endereço digitado/escolhido na corrida (recibo e histórico da
   conta) conta como "derived database" da 11.6.1?
2. Até quando dá para usar o plano grátis com passageiros reais, ou é preciso
   contratar o plano pago antes de abrir ao público?
3. O "© TomTom" fixo atende a 17.3, ou é preciso usar a Copyright API?
4. Quem assina o contrato pago: pessoa física (Evandro) ou a empresa?
