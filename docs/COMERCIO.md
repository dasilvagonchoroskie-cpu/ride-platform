# Fortaleza Move Comércio — 4º aplicativo

Desenvolvido em 12/11/2026 (branch `comercio-app`, PR #59, rascunho). **Não opera:** o Comércio
nasce com a **chave geral bloqueada** (veja abaixo) e nada aqui liga Moto, tarifa, comissão,
carteira ou repasse. Atenção: no banco de produção a Entrega **está ligada em Goiatuba**
(carro e moto, configuração de teste do dono de 11/11/2026, preservada). Por isso a chave geral
do Comércio é independente da chave da cidade.

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

## Chave geral do Comércio (bloqueada por padrão)

Registro `comercio.config` na tabela de configurações (`settings`). **Sem registro = bloqueado**;
só o valor `ativo: true` libera. Enquanto estiver bloqueada, mesmo uma loja APROVADA recebe
"As entregas pelo aplicativo Comércio ainda não foram liberadas pela Central" ao consultar preço
ou pedir entrega — o motor de corridas nem é chamado. Cadastro, aprovação, histórico e cancelamento
continuam. Quem liga: **só o dono**, em Central → Comércios → "Entregas do Comércio liberadas"
(`PUT /admin/comercios/config`, auditado com antes e depois; operador de cidade só vê). Ligar a chave
**não** liga a Entrega em cidade nenhuma: o pedido ainda precisa de Entrega ligada na cidade da coleta
(`exigirLigada`, checado dentro do pedido oficial) e de o veículo estar permitido ali.

Portas que o pedido precisa atravessar, todas no servidor e conferidas **a cada consulta de preço e a cada pedido** (não só no cadastro): (1) conta de passageiro com e-mail confirmado,
(2) estabelecimento APROVADO pelo dono, (3) chave geral do Comércio ligada, (4) Entrega ligada na
cidade da coleta, (5) veículo aceito na cidade.

## Contas apagadas

Apagar uma conta (Central → Excluir passageiro, Limpeza de dados, "desfazer conta nova") não trava
mais por causa do cadastro da loja: sem entregas o cadastro sai junto; com entregas ele fica
SUSPENSO e sem dados pessoais (nome, CNPJ, CPF, telefone, e-mail, endereço). Nunca derruba a exclusão.

## Regras que o servidor garante (não depende do app)

- Cadastro nasce **AGUARDANDO**. Não existe aprovação automática.
- CNPJ e CPF com dígito verificador; telefone, e-mail, CEP e senha validados; CNPJ não repete.
- Só loja **APROVADA**, com a chave geral ligada, pede preço e entrega. SUSPENSO/REJEITADO/AGUARDANDO são barrados.
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

| Camada | Arquivo / esteira | Resultado |
|---|---|---|
| Servidor | `comercio.regras.spec.ts`, `comercio.service.spec.ts`, `comercio.portas.spec.ts` | Esteira "Testes do servidor" no commit `7c524ab`: compilação limpa, 28 arquivos de teste e **253 testes passam** (72 são do Comércio) |
| App Comércio | `apps/comercio_app/test/*` (esteira "Android Comercio") | análise sem problemas, 53 de 53 passam (última rodada no commit `58a6f29`; a pasta do app é idêntica à do commit atual) |
| Central | `apps/central_app/test/painel_test.dart` (esteira "Android APKs") | análise sem problemas, 71 passam, 1 pulado de antes (última rodada no commit `419b5ee`; a pasta do app é idêntica à do commit atual) |
| Rotas | `scripts/conferir-rotas.py` | 263 chamadas conferidas, todas existem no servidor |

As esteiras do Android só rodam quando uma pasta de app muda; por isso, depois de commits só
de servidor ou de documentos, vale conferir se a pasta do app continua idêntica à da rodada
verde (`git rev-parse <commit>:apps/central_app`).

### Cobertura das cinco portas (12/11/2026)

| Porta | Onde fica | Como é testado |
|---|---|---|
| 1. E-mail confirmado | `ComercioService.podePedir` | automático, a cada consulta e pedido (e-mail não confirmado, sem e-mail, conta que não é de passageiro) |
| 2. Loja aprovada | `ComercioService.aprovado` | automático (AGUARDANDO, REJEITADO e SUSPENDO barram; só APROVADO passa) |
| 3. Chave geral ligada | `ComercioService.exigirAtivo` | automático (bloqueada: nem preço nem pedido, e o motor de corridas não é chamado) |
| 4. Entrega ligada na cidade | `RidesService.pedir` / `EntregasService.exigirLigada` (código já existente) | automático com o **pedido oficial de verdade** (`comercio.portas.spec.ts`): sem configuração, cidade desligada e outra cidade barram |
| 5. Veículo aceito na cidade | `RidesService.pedir` (código já existente) | automático com o pedido oficial de verdade: moto em cidade só-carro e carro em cidade só-moto barram |

Nada disso foi testado contra o servidor de produção: as rotas do Comércio só passam a existir lá
depois do merge e da publicação. Depois disso, o teste mais seguro no servidor de verdade é o
"Comércio bloqueado" (chave desligada: consultar preço e pedir devem ser recusados).

## O que NÃO foi (nem pode ser) testado ainda

- **Despacho de verdade a motorista:** com a chave geral do Comércio bloqueada, nenhum motorista real recebe
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
