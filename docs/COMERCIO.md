# Fortaleza Move Comércio — 4º aplicativo

Desenvolvido em 12 e 13/11/2026 (branch `comercio-app`, PR #59, rascunho). **Não opera:** o Comércio
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
| Avisos | A caixa de notificações da plataforma (o "sino": `CaixaDeEntradaService`, `/notificacoes`). Nenhum canal novo, nenhum serviço pago |
| Mapa | Imagens pelo `GET /geo/mapa` (mesmo fornecedor dos outros apps; a chave vem do servidor, nunca do app) e a posição do motorista que a plataforma já grava (`driver_locations`). **Não existe segundo sistema de localização** |
| Termos de uso | Rota pública `GET /legal/comercio` no módulo legal existente |

Duas tabelas novas, criadas no boot do servidor (`CREATE TABLE IF NOT EXISTS`):
`comercios` (cadastro, situação e a versão dos termos aceitos: colunas `termos_versao` e
`termos_aceitos_em`, acrescentadas com `ADD COLUMN IF NOT EXISTS` só nessa tabela nova) e
`comercio_pedidos` (liga o pedido à loja e guarda a chave anti-duplicidade). Nenhuma tabela
existente foi alterada. Os avisos usam a tabela `notifications` que já existia (só linhas novas).

## Rotas

Loja (papel PASSAGEIRO), prefixo `/comercio`: `GET meu`, `POST cadastro` (exige `aceiteTermos: true`),
`PATCH meu`, `POST entregas/preco`, `POST entregas`, `GET entregas`, `GET entregas/:id`,
`GET entregas/:id/repetir`, `POST entregas/:id/cancelar`, `GET gastos`. O app também usa rotas que já
existiam: `/notificacoes` (sino), `/geo/mapa` (imagens do mapa), `/geo/search` (endereço) e a pública
`/legal/comercio` (termos).

`GET entregas/:id` devolve o campo `mapa` = `{ coleta, entrega, motorista }` (só pontos, sem telefone,
sem dados do passageiro). Antes devolvia a corrida inteira do passageiro dentro de `aoVivo`; isso foi
retirado para o estabelecimento receber só o necessário.

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

## Avisos para a loja (sino)

Usa só a caixa que a plataforma já tem. Cada aviso vai **somente** para a conta dona do cadastro ou do
pedido (isolamento por conta), sem telefone do motorista, CNPJ, CPF nem valores.

| Evento | Quando sai |
|---|---|
| Cadastro recebido | Ao enviar o cadastro |
| Aprovado, não aprovado (com motivo), suspenso (com motivo), reativado | Na decisão da Central (`adminDecidir`) |
| Entrega aceita, motorista a caminho, motorista chegou à loja, encomenda coletada, entrega concluída, entrega cancelada, problema na entrega, nenhum motorista aceitou | Conferência a cada 20 s dos pedidos abertos (e dos que acabaram há menos de 30 min) e quando a loja abre o acompanhamento |

Cada marco da mesma entrega avisa **uma vez só** (chave `rideId:etapa` gravada no aviso). A conferência
periódica existe porque alguns desfechos (ninguém aceitou, cancelamento do sistema) não passam por tela
nenhuma. O aviso nunca derruba o cadastro nem a decisão (erro só vai para o log).

No app: sino na barra (também na tela "aguardando aprovação", por onde chega a decisão), lista com marcar
como lido, apagar com confirmação e toque que abre o acompanhamento. O app mostra só avisos de tipo
`comercio-*`; o sino da conta é o mesmo dos passageiros, então avisos gerais da Central para passageiros
não aparecem na loja.

**Dependência externa (push no celular):** o servidor já manda push (Firebase) pelo mesmo caminho quando
as variáveis `FCM_*` existem, mas o app Comércio **ainda não tem Firebase** (precisaria registrar o pacote
`br.com.fortalezamov.comercio` no projeto Firebase e incluir o `google-services.json`). Por isso hoje o aviso
aparece quando o app consulta o servidor (a cada 30 s com o app aberto), não com o app fechado. SMS e WhatsApp:
não existem na plataforma e não foram inventados.

## Mapa e acompanhamento

- O app desenha loja (coleta), destino e, **só enquanto o motorista está com a entrega**, a última posição que
  o aparelho dele mandou (a mesma que o passageiro vê nas corridas). Atualiza a cada 8 s com a tela aberta.
- Ponto que o servidor não mandou não aparece. Sinal com mais de 2 minutos é marcado "desatualizado" (ponto
  cinza e aviso com a hora). Motorista aceitou mas sem sinal: o app explica, sem desenhar posição.
- Sem as imagens do mapa (sem rede ou fornecedor indisponível), os pontos continuam certos e a tela avisa
  que as ruas não estão disponíveis.
- Quem mexe no mapa não é "puxado de volta" a cada atualização; o botão "Centralizar" reenquadra.
- O app **não pede a localização do celular da loja** (permissões continuam só internet e estado da rede).
- Entrega encerrada: sem mapa e sem posição.

## Termos de uso e condições comerciais

Texto em `apps/backend/src/modules/comercio/comercio.termos.ts` (versão `0.1.0-minuta`), servido em
`/legal/comercio` (JSON) e `/legal/termos-comercio` (página). Estrutura: identificação e responsabilidades da
loja, aprovação e disponibilidade, responsabilidades da entrega, preço/pagamento/gastos, cancelamento, dados
pessoais (LGPD), limitações da plataforma, suspensão, mudanças e contato.

**É uma minuta técnica, NÃO aprovada por advogado.** O app mostra essa faixa na tela dos termos. O cadastro
só é aceito com o aceite marcado (o servidor também recusa sem `aceiteTermos`) e grava versão e data do
aceite. A Central mostra a versão aceita no detalhe da loja. Para validação externa (lista também no fim do
arquivo): dados da operadora (CNPJ em registro), limite de responsabilidade por dano/extravio e seguro,
vínculo loja–plataforma–motorista e produtos regulados, regras de cancelamento/cobrança em entrega falha,
papéis na LGPD e retenção, foro, nota fiscal. Pendente de decisão: novo aceite quando a versão mudar (hoje o
aceite é no cadastro).

## Pagamento e gastos

Mantidas as regras oficiais: o pedido sai com `paymentMethodType: 'CASH'` (testado), ou seja, dinheiro direto
ao motorista. **Não existe** carteira da loja, crédito, saldo, assinatura, mensalidade, cobrança automática
nem gateway; nenhuma carteira, comissão ou repasse existente foi tocado. A tela Gastos só soma entregas
concluídas. Outras formas de pagamento (PIX, cartão, fatura mensal) dependem de **decisão comercial do dono**
e de infraestrutura que a plataforma ainda não tem; nada disso foi implementado nem simulado.

## Identidade visual

Ícone próprio (loja com toldo dourado sobre o azul da família, com faixa verde-água da cor do app), nas versões
legado, redondo, adaptativa (zona segura) e monocromática, mais o ícone 512 px para a loja de aplicativos
(`apps/comercio_app/loja/icone-512.png`). O ícone anterior era cópia idêntica do da Central. Nome na tela:
"Fortaleza Move Comércio"; pacote `br.com.fortalezamov.comercio`; versão montada pela esteira (1.0.N).

## Auditoria definitiva (12/11/2026)

Achados, correções, limitações e a configuração de lançamento estão em **`docs/COMERCIO-AUDITORIA.md`**.
Resumo: 11 falhas corrigidas (teto de entregas abertas, coleta alternativa só na cidade da loja, total de gastos
completo, **preço confirmado = preço cobrado**, atualização só com o app aberto, sessão vencida, entre outras);
nenhuma tarifa, comissão, carteira ou configuração de cidade foi tocada; chave geral continua bloqueada.
Esteira do pacote da Play (`aab-comercio.yml`) preparada e **não executada**.

## Mapa operacional, Motos e lançamento manual de entrega (12/11/2026)

Tudo abaixo reaproveita o que já existia (despacho, localização, pedido do Comércio, cinco portas). Nada novo de
despacho, localização ou financeiro. Só código e testes automáticos: **nada foi implantado**, e as colunas novas
só passam a existir no banco quando o servidor subir depois de um merge autorizado.

### Mapa único da Central (tela inicial)
- Um só mapa com carros e motos: corrida de passageiro, entrega do Comércio, livres, offline, aguardando motorista e SOS.
- **Ícone = tipo do veículo; cor = tipo de serviço** (nunca só cor). Passageiro mantém as cores atuais; entrega do
  Comércio (carro ou moto) é **azul-ciano** (`AppColors.comercio`, `0xFF00B8D4`), exclusivo do Comércio, no pino, na
  legenda e nos detalhes; **SOS é vermelho e prevalece** sobre qualquer serviço, mantendo o contexto da entrega.
- Filtros discretos: Todos (padrão), Carros, Motocicletas, Transporte de passageiros, Entregas do Comércio, Veículos
  livres, SOS. Só mudam o que se vê; não afetam despacho, localização nem segurança.
- O tipo de serviço vem **estruturado do servidor** (`servico`, `origemDoServico`, `comercio`, `corrida`, `sos` em
  `CentralService.livresPerto`), não por texto. Entrega que não é do Comércio continua laranja e só aparece em Todos/Carros/Motos.
- Detalhes do marcador: motorista, tipo de veículo, identificação, estado, tipo de serviço, id da corrida/entrega e
  localização; sem dados pessoais desnecessários.

### Motos e Carros na Central
- Menu **Carros** e **Motos** separados (mesmos dados, `GET /admin/frota` com filtro de praça). Lista, busca, detalhe
  (dono/motorista, marca/modelo, ano, placa, documentos, situação, histórico), aprovar/rejeitar e **suspender/reativar**
  (`PATCH /admin/vehicles/:id/suspensao`, situação `SUSPENSO`).
- Cadastro da moto **não é** autorização de entrega; permissões municipais não foram tocadas.
- A data de validade de documento **não existe no modelo de dados**: a tela mostra "validade não registrada pelo sistema".

### Lançar entrega manualmente (app do motorista)
Botão "Lançar entrega manualmente", separado de "Lançar corrida manual". Fluxo: buscar estabelecimento (telefone,
e-mail ou nome) → perfil para confirmar (nome comercial, identificação do cadastro, endereço de retirada, situação,
entregas **concluídas**, histórico recente com origem) → dados da encomenda, de quem recebe e destino (endereço
completo, CEP e posição confirmada no mapa) → **preço oficial calculado pelo servidor** para o veículo do próprio
motorista → confirmar e lançar.
- Servidor: `driver/manual-deliveries` (`POST buscar`, `GET estabelecimentos/:id`, `POST cotar`, `POST /`), em
  `central/entrega-manual.*`. Usa o mesmo `ComercioService.criarEntrega` do app da loja (mesmo `RidesService.pedir`).
- Valem **as mesmas cinco portas** (e-mail confirmado, loja aprovada, chave geral, Entrega ligada na cidade, veículo
  aceito), isolamento por cidade e teto de entregas abertas. O motorista não habilita Comércio, não aprova loja e não
  muda permissão de cidade. Vários resultados = escolha manual; nunca cria cadastro; motivo claro se não achar/não liberada.
- Anti-duplicidade: chave de 16 a 64 caracteres; queda de rede → "Tentar de novo" com a **mesma** chave; preço mudou
  (409 "O preço mudou…") → mostra o valor novo e pede nova confirmação com chave nova (`valorEsperadoCents`).
- Auditoria de origem: colunas `origem` (APP/MOTORISTA), `lancado_por`, `lancado_em` em `comercio_pedidos`
  (`ADD COLUMN IF NOT EXISTS`, aplicadas só no deploy). Aparece em Central → Entregas, Ao Vivo, Comércios, histórico da
  loja e relatórios. As duas origens são ciano no mapa.

### Testes desta etapa (esteira, commit `6734416`)
Servidor: 31 arquivos / **326 testes** passam, compilação limpa · Central: análise limpa, **91 testes** (+1 pulado) ·
Motorista: análise limpa, **133 testes** (+7 pulados de antes). Todos com servidor falso/dados simulados.
Não testado: celular real, mapa com posição real, entrega de verdade, servidor de produção, cor/legibilidade ao sol.

## Testes e esteiras

| Camada | Arquivo / esteira | Resultado |
|---|---|---|
| Servidor | `comercio.regras.spec.ts`, `comercio.service.spec.ts`, `comercio.portas.spec.ts` | Esteira "Testes do servidor" no commit `bef4d60` (auditoria): 28 arquivos de teste e **275 testes passam** (inclui avisos, mapa, termos/aceite e as cinco portas com o `RidesService.pedir` real). Tudo com dados simulados |
| App Comércio | `apps/comercio_app/test/*` (esteira "Android Comercio") | análise sem problemas, **86 testes passam** no commit `bef4d60` (inclui sino, mapa, termos, modelos e proteção de preço) |
| Central | `apps/central_app/test/painel_test.dart` (esteira "Android APKs") | análise sem problemas, 71 passam, 1 pulado de antes (commit `588f49b`) |
| Rotas | `scripts/conferir-rotas.py` | 268 chamadas conferidas contra 260 rotas, todas existem no servidor |

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
- Aparelho real: o app ainda não foi instalado num celular (por decisão do dono nesta fase: só código e
  testes automáticos). O mapa, o sino e o ícone foram verificados em teste de tela automático e no desenho
  do ícone, **não** num celular.
- Mapa com imagens reais e posição real de motorista: só testado com imagens e posição simuladas.
- Push no celular (Firebase) e SMS/WhatsApp: dependência externa (ver "Avisos para a loja").
- Texto dos termos: minuta, sem revisão jurídica.
- Forma de pagamento: hoje só **dinheiro direto ao motorista**; outras formas dependem de
  decisão do dono.
- App do motorista: **não foi alterado**; ele recebe a identificação comercial na descrição ("COMÉRCIO nome (telefone): encomenda | Obs | Ref", até 200 caracteres) e os dados de quem recebe pelo mecanismo existente da entrega. Um selo próprio de "Comércio" no app do motorista exigiria nova versão desse app e fica como melhoria opcional.
