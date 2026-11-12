# Fortaleza Move Comércio — 4º aplicativo

Desenvolvido em 12/11/2026 (branch `comercio-app`, PR #59, rascunho). **Não opera:** a entrega
continua desligada em todas as cidades e nada aqui liga Moto, tarifa, comissão, carteira ou
repasse. Ligar é decisão do dono, em Central → Entregas.

O Comércio **não é marketplace**: a loja pede que um motorista busque e entregue uma encomenda
dela. Não há catálogo, pedido de cliente final, cardápio nem pagamento dentro do app.

## O que ele reaproveita (nada novo no banco do núcleo)

| Peça | Como o Comércio usa |
|---|---|
| Login por código no e-mail / senha | Mesmo `/auth/*`; a conta é do papel PASSAGEIRO, e o app recusa os outros papéis e quem tem duas etapas |
| Pedido de entrega | Chama o mesmo `RidesService.pedir` da entrega de encomenda do passageiro (mesma fila e mesmos motoristas) |
| Preço | O oficial: `estimar` da cidade. Moto/Carro só aparecem onde a Central ligou |
| Acompanhamento | Estado real do pedido no servidor + posição do motorista quando existe |
| Endereço | `/geo/search` (mesma busca dos outros apps) |

Duas tabelas novas, criadas no boot do servidor (`CREATE TABLE IF NOT EXISTS`):
`comercios` (cadastro e situação) e `comercio_pedidos` (liga o pedido à loja e guarda a chave
anti-duplicidade). Nenhuma tabela existente foi alterada.

## Rotas

Loja (papel PASSAGEIRO), prefixo `/comercio`: `GET meu`, `POST cadastro`, `PATCH meu`,
`POST entregas/preco`, `POST entregas`, `GET entregas`, `GET entregas/:id`,
`GET entregas/:id/repetir`, `POST entregas/:id/cancelar`, `GET gastos`.

Central (papel ADMIN), prefixo `/admin/comercios`: `GET` (lista, filtros), `GET entregas`,
`GET :id`, `POST :id/decisao` (APROVAR, REJEITAR, SUSPENDER, REATIVAR). **Só o dono grava**
(`DonoGravaGuard`); o operador de cidade lê só a cidade dele. Cada decisão vai para a auditoria.

## Regras que o servidor garante (não depende do app)

- Cadastro nasce **AGUARDANDO**. Não existe aprovação automática.
- CNPJ e CPF com dígito verificador; telefone, e-mail, CEP e senha validados; CNPJ não repete.
- Só loja **APROVADA** pede preço e entrega. SUSPENSO/REJEITADO/AGUARDANDO são barrados.
- Cada loja só enxerga e cancela as **próprias** entregas (outra loja recebe "não encontrado").
- **Sem duplicidade:** cada pedido leva uma chave; repetir a mesma chave devolve a entrega já
  criada e não cria outra. Queda de rede **nunca** é tratada como "pedido feito": o app mostra
  "não sabemos se foi" e reenvia com a **mesma** chave.
- Moto/Carro só se a cidade tem entrega ligada com esse veículo (senão o servidor recusa).
- Sem carteira, crédito, débito automático, mensalidade ou assinatura. A tela **Gastos** só
  soma as entregas feitas (pagamento direto ao motorista, como nas outras entregas).
- A identificação comercial (loja, endereço de coleta, telefone da loja, quem recebe,
  descrição, observações) segue para o motorista no campo de descrição da entrega.

## App (`apps/comercio_app`, pacote `br.com.fortalezamov.comercio`)

Telas: entrada (código por e-mail ou senha) · cadastro · situação do cadastro (aguardando,
rejeitado com motivo, suspenso) · Entregas · Histórico (com **Repetir**: só preenche, exige
novo preço e nova confirmação) · Gastos · Conta · dados do estabelecimento · nova entrega em
6 passos (encomenda, coleta que já vem com o endereço da loja, quem recebe, veículo, preço
oficial, resumo e confirmar) · acompanhamento (linha do tempo, atualiza sozinho a cada 8 s,
cancelar).

Identidade própria (verde-azulado "loja") dentro da família azul-marinho e dourado.
Interface em português.

## Central (`apps/central_app`, menu **Comércios**)

Lista com filtro (Todos, Aguardando, Aprovados, Suspensos, Rejeitados), detalhe com dados e
gastos do mês, aprovar/rejeitar/suspender/reativar com confirmação e motivo (rejeitar e
suspender exigem motivo; o aviso diz que **nenhuma tarifa ou comissão muda**), entregas pedidas
pelo Comércio e, no menu Entregas, a origem "Comércio: nome da loja".

## Testes e esteiras

| Camada | Arquivo / esteira | Resultado (12/11/2026) |
|---|---|---|
| Servidor | `comercio.regras.spec.ts`, `comercio.service.spec.ts` | 48 de 48 passam (esteira "Testes do servidor") |
| App Comércio | `apps/comercio_app/test/*` (esteira "Android Comercio") | análise sem problemas, 51 de 51 passam |
| Central | `apps/central_app/test/painel_test.dart` (esteira "Android APKs") | análise sem problemas, 71 passam, 1 pulado de antes |
| Rotas | `scripts/conferir-rotas.py` | 257 chamadas conferidas, todas existem no servidor |

## O que NÃO foi (nem pode ser) testado ainda

- **Despacho de verdade a motorista:** com a entrega desligada, nenhum motorista real recebe
  pedido do Comércio. Os testes de despacho, aceite/recusa, atualização de status e conclusão
  são do **serviço com o pedido simulado** (`pedir` falso com o formato real). O ponta a ponta
  com motorista só ocorre depois de autorização expressa do dono (ligar a entrega numa cidade
  de teste).
- Aparelho real: o app ainda não foi instalado num celular.
- Mapa ao vivo no acompanhamento: mostra o ponto de partida/entrega e a posição do motorista em
  texto; o mapa desenhado fica para a segunda versão.
- Aviso por notificação ao comerciante quando a Central decide: não existe (ele vê na abertura
  do app).
- Ícone próprio e texto de termos de uso para lojas: pendentes (o texto exige revisão jurídica).
- Forma de pagamento: hoje só **dinheiro direto ao motorista**; outras formas dependem de
  decisão do dono.
- App do motorista: **não foi alterado**; ele recebe a identificação comercial na descrição.
