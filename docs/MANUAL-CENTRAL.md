# Manual da Central — operação do dia a dia

Atualizado em 13/11/2026. Descreve o que o app da Central faz hoje. O que depende do dono está marcado **[dono]**;
telas que o operador de cidade não vê estão marcadas **[só dono]**.

## 1. Quem entra
- **Dono**: vê todas as cidades e é o único que muda tarifas, cupons, comissão, cidades/equipe, limpeza de dados e configurações.
- **Operador de cidade**: criado em Cidades e equipe → Operador; entra com senha provisória, tem de trocá-la no primeiro
  acesso e **só vê a cidade dele**. Não mexe em telefone nem e-mail de motorista.
- Entrada por senha ou por **código no e-mail**. Duas etapas do dono: ainda desligadas **[dono decide]** (`docs/DUAS-ETAPAS-DONO.md`).
- Esqueceu a senha / perdeu o acesso: `docs/RECUPERACAO-DE-CONTAS.md`.
- Escolha a cidade no topo (ou "Todas as cidades"). A lista e os números seguem a cidade escolhida.

## 2. Menus (nome na tela)
| Menu | Para que serve |
|---|---|
| Visão Geral | Mapa único: carros e motos, corridas, entregas do Comércio (ciano), livres, offline, SOS (vermelho prevalece). Filtros só mudam o que se vê. |
| Motoristas ao vivo (Ao vivo) | Motoristas por situação, no mapa e em lista; corridas de hoje. |
| Despacho | Acompanhar e intervir em chamados sem motorista. |
| Entregas | Pedidos de entrega da cidade, com origem (App, "Comércio: loja", lançamento do motorista); **Liberar código** depois de 5 erros. |
| Comércios | Lojas: filtro Todos/Aguardando/Aprovados/Suspensos/Rejeitados; aprovar, rejeitar, suspender, reativar. |
| Motoristas | Cadastros: aprovar/rejeitar, documentos, fotos, dados pessoais. |
| Carros / Motos | Mesma frota em duas visões: lista, busca, detalhe, aprovar/rejeitar, suspender/reativar, validade do CRLV. |
| Passageiros **[só dono]** | Contas de passageiros. |
| Categorias | Aprovação de categoria de carro. |
| Tarifas **[só dono]** | Bandeirada, km, mínima, comissão (diurna/noturna). **Não alterar sem decisão do dono.** |
| Financeiro | Resumos e relatórios. |
| Alertas e Segurança (Alertas) | SOS e ocorrências. |
| Cupons **[só dono]** · Clube de Vantagens | Promoções. |
| Carteiras / Recargas | Recarga e conferência de saldo de motoristas. |
| Cidades e equipe **[só dono]** | Cidades, operadores, quais serviços estão ligados em cada uma. |
| Limpeza de dados **[só dono]** | Remoção de dados de teste. Pede confirmação; não desfaz. |
| Configurações **[só dono]** | Aparência do app e segurança (duas etapas). |

## 3. Rotinas
### Aprovar motorista
Aviso "Motorista aguardando aprovação" → **Ver cadastro** → conferir documentos, foto e **validade da CNH** (cadastro
com CNH vencida é recusado). Aprovar ou rejeitar com motivo. Carro novo e foto nova também chegam como "para conferir".

### Carros e Motos
Menu Carros ou Motos → abrir o veículo → conferir dono/motorista, placa, documentos, situação e histórico.
- **Suspender/reativar**: tira ou devolve o veículo da operação (situação `SUSPENSO`).
- **Validade do CRLV**: anotar a data (AAAA-MM-DD) no detalhe. É **só registro e aviso** ("CRLV vencido" e "CNH vencida"
  aparecem na lista): o sistema **não bloqueia** o veículo por vencimento **[dono decide]**.
- Cadastro de moto **não** libera entrega: entrega depende da cidade, da categoria e da chave geral.

### Comércios (lojas)
Só o dono decide aprovação. Rejeitar e suspender exigem motivo. O aviso na tela repete: **nenhuma tarifa ou comissão
muda** por isso. Duas pessoas decidindo ao mesmo tempo: a segunda recebe aviso de conflito e deve recarregar.
A **chave geral do Comércio** vem bloqueada **[dono decide]** e entrega por moto está **desligada**.

### Entregas
Menu Entregas mostra status, quem pediu, quem recebe, código e valor. O motorista também pode **lançar entrega
manualmente** no app dele (loja já cadastrada e aprovada, preço calculado pelo servidor); aparece aqui com a origem e o
nome de quem lançou.

### SOS e alertas
O alarme toca com a Central aberta ou minimizada. Ligar para o motorista e para o passageiro, registrar a ocorrência
e só então encerrar. Em dúvida, acione o dono.

### Aparelhos e contas
No detalhe de um motorista ou passageiro (menus Motoristas e Passageiros): botão **Aparelhos** (lista os celulares que
entraram na conta; **desconectar um aparelho** é só do dono e fica na auditoria), **Desconectar todos** e
**Recuperar acesso**. Trocar a senha derruba os outros aparelhos na hora.

### Recarga / carteira
Conferir o comprovante antes de creditar. Regras de carteira e bloqueio por saldo **não são mudadas por operador** **[dono]**.

## 4. O que nunca fazer sem o dono
Mudar tarifas ou comissões · ligar Conforto/Premium/Moto/Entregas · liberar a chave geral do Comércio · limpar dados de
produção · desligar o modo de teste do código (`OTP_DEBUG_RETURN`) · mexer em pagamentos.

## 5. Se algo parecer errado
1. Atualizar a tela (botão de atualizar no topo; a Central atualiza a cada 5 segundos).
2. Ver se aparece "Sem sinal do servidor". Se sim, conferir `/health` do servidor.
3. Anotar hora, cidade e o que viu e avisar o dono. Não repetir ação financeira "para ver se vai".

Relacionados: `docs/CONTAS.md` · `docs/SEGURANCA-CENTRAL.md` · `docs/ENTREGAS.md` · `docs/COMERCIO.md` · `docs/FIREBASE.md` · `docs/TESTE-DE-RUA.md`.
