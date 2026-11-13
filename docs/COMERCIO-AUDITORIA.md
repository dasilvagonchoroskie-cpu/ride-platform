# Fortaleza Move Comércio — auditoria definitiva (12/11/2026)

Auditoria feita sobre o **código real** da branch `comercio-app` (PR #59, rascunho, **sem merge**), não sobre
relatórios anteriores. Tudo foi testado em ambiente simulado/automático. **Nada foi implantado, nenhuma entrega real
foi acionada, a chave geral do Comércio continua bloqueada e nenhum dado de produção foi alterado.**

Rótulos: AUDITADO · CORRIGIDO · TESTADO AUTOMATICAMENTE · SIMULADO · PENDENTE · DEPENDÊNCIA EXTERNA · AGUARDANDO AUTORIZAÇÃO.
Não houve nenhum teste em celular real (TESTADO EM DISPOSITIVO REAL = nenhum).

## 1. Falhas encontradas e corrigidas

| # | Gravidade | Falha | Causa | Correção | Prova |
|---|---|---|---|---|---|
| A1 | Média (integridade) | O total de "Gastos" ficava errado com mais de 500 entregas no período | O total era somado em cima da mesma lista cortada em 500 | Total vem de consulta própria (só colunas necessárias, teto 20.000); a lista é separada, só entregas concluídas; resposta traz `listaCortada` e o app avisa | `comercio.service.spec.ts` (gastos com 650 entregas) + `modelos_test.dart` |
| A2 | Alta (abuso/custo) | Uma loja podia abrir entregas ilimitadas ao mesmo tempo | `varias:true` pula a regra "uma corrida aberta" e nada limitava a loja | Teto de 20 entregas abertas por loja (409 com mensagem clara) | teste do teto 20 |
| A3 | Alta (porta) | A "coleta em outro endereço" podia ser em **outra cidade**, fora da praça da loja, e escapava da porta de cidade da loja | A porta de entrega ligada olhava só o ponto de coleta, que a loja podia trocar | `exigirColetaNaCidade`: a coleta alternativa tem de estar na mesma praça do estabelecimento (preço e pedido) | teste com praças Goiatuba × Itumbiara |
| A4 | Baixa | Aviso de "coletada" podia sair duas vezes | Duas etapas (`A_CAMINHO_DA_ENTREGA` e `COLETADA`) geravam chaves diferentes | Chave do aviso por marco (`marcoDoAviso`) | teste de aviso único (e verificado que falha sem a correção) |
| A5 | Média (bateria/dados) | O app consultava o servidor com a tela em segundo plano e com abas escondidas | `Timer` simples e `IndexedStack` | `AtualizacaoPeriodica` (só com o app em primeiro plano; atualiza ao voltar) e só a aba aberta existe | `atualizacao_test.dart` |
| A6 | Média | "Entregas não liberadas" ficava velho: a loja já liberada ainda era barrada | Estado só lido no login | `_nova` confere o servidor antes de recusar; tela de status se atualiza sozinha (30 s) | `telas_test.dart` (liberada depois / suspensa depois) |
| A7 | Média | Sessão vencida deixava telas empilhadas e os tokens guardados no aparelho | Navegação não voltava à entrada e os tokens não eram apagados | `popUntil` só quando perde login/aprovação; tokens apagados ao vencer | teste "sessão vencida com tela empilhada" |
| A8 | Média | Cadastro exigia senha mesmo para quem já tem conta | Campo obrigatório no app | Senha opcional (servidor já aceitava) | `telas_test.dart` |
| A9 | Alta (financeiro) | O preço **mostrado** podia ser diferente do **cobrado** se a tarifa mudasse entre a consulta e o pedido | O servidor recalcula o preço no pedido; o app não enviava o que a pessoa confirmou | `valorEsperadoCents`: se o preço oficial mudou, o servidor recusa com 409 "O preço mudou…" e o app volta ao passo do preço com nova chave. **O preço continua sendo o do motor oficial; nenhuma tarifa foi tocada** | 4 testes de servidor + 2 de tela + 2 de API do app |
| A10 | Baixa | Lista de gastos cortada sem aviso | — | Faixa de aviso no app | `modelos_test.dart` |
| A11 | Baixa | Análise do app acusava nome de parâmetro diferente do Flutter | — | Nome igualado | `flutter analyze` limpo |

Também foi **reforçado por teste** (não era falha): o guarda de papéis é exercitado com o `RolesGuard` de verdade em **todas**
as rotas do Comércio (passageiro só nas do app; administrador só nas da Central; operador de cidade não grava).

## 2. Segurança (AUDITADO)

- **Autenticação/sessão:** ordem dos guardas globais `LimitePorClienteGuard → JwtAuthGuard → RolesGuard → SenhaProvisoriaGuard`;
  tokens do app guardados só no armazenamento seguro do aparelho e apagados ao vencer a sessão.
- **Autorização:** `ComercioController` só para passageiro; `AdminComercioController` só administrador + `DonoGravaGuard`
  (operador de cidade lê, **não grava**). A chave global só é gravada pelo dono (`PUT /admin/comercios/config`), com auditoria.
- **Isolamento entre lojas:** toda leitura/gravação filtra pelo estabelecimento da conta; id de outra loja devolve 404, sem vazar existência.
- **Injeção:** DDL estática no boot (`$executeRawUnsafe` só com texto fixo, sem dado do usuário); consultas por Prisma parametrizado; entradas validadas por zod
  (limites de tamanho, `valorEsperadoCents` 0–10.000.000).
- **Repetição/idempotência:** chave de pedido (32 caracteres) + trava em memória por loja + gravação do pedido na **mesma transação** da corrida; repetir com a mesma chave não duplica.
- **PII:** a loja só vê o primeiro nome e o veículo do motorista (nunca o telefone) e a posição dele apenas enquanto a entrega está aberta; logs e auditoria sem senha, token ou código.
- **Limitação conhecida:** a trava em memória é por instância; com várias instâncias a chave de idempotência (banco) é quem garante a unicidade.
- **Dependências do servidor (`pnpm audit --prod`, já existentes antes do Comércio):** zod 3.25.76 (alta; correção exige zod 4), @nestjs/core 10.4.22 (moderada; exige Nest 11 no aviso do auditor), file-type 20.4.1 (2 moderadas).
  **Não atualizadas** pela regra do projeto "Zod 4 e Nest 11 só com OK do dono" → AGUARDANDO AUTORIZAÇÃO.

## 3. As cinco portas (TESTADO AUTOMATICAMENTE, com o `RidesService.pedir` de verdade)

E-mail confirmado · loja aprovada pelo dono · chave geral ligada pelo dono · entrega ligada na cidade · veículo aceito na cidade.
Combinações positivas e negativas testadas em `comercio.service.spec.ts` e `comercio.portas.spec.ts`; chamada direta à API
não contorna nenhuma (as portas ficam no servidor, no preço **e** no pedido). Operador de cidade não liga a chave global.
Loja suspensa ou não aprovada não pede. A chave global **continua bloqueada** (não existe registro `comercio.config` em produção).

## 4. Integrações, mapa, avisos, termos, financeiro

- **Motor de corridas:** o Comércio chama `RidesService.estimar/pedir` existentes; não há segundo sistema de despacho, posição ou financeiro. Origem identificada como Comércio.
- **Mapa/posição:** posição do motorista só durante a entrega aberta (`posicaoDoMotorista`), sem posição fictícia; sem rede o app mostra a última informação avisando; imagens do mapa vêm de `/geo/mapa`.
- **Avisos (12 eventos):** uma vez só, para a loja certa, com estado real do servidor. Sino por `/notificacoes`. **Push no celular depende do Firebase** (DEPENDÊNCIA EXTERNA): o app não tem Firebase; nada foi simulado como push.
- **Termos/LGPD:** aceite obrigatório com versão/data gravadas; texto é **minuta técnica, sem aprovação jurídica** — organizado para revisão profissional (PENDENTE). Não há declaração de conformidade.
- **Financeiro:** preços do motor oficial; dinheiro direto ao motorista; sem carteira, gateway, cobrança automática ou novo modo de pagamento; tarifas/comissões/repasses intocados.

## 5. Android e pacote da loja

- Pacote `br.com.fortalezamov.comercio`, nome "Fortaleza Move Comércio", minSdk 24, targetSdk 36, 64 bits (split por ABI), `allowBackup=false`, só INTERNET e ACCESS_NETWORK_STATE.
- Release: R8 + redução de recursos, ofuscação Dart (`--obfuscate`), sem chave privada no app (assinatura só por segredo do repositório, escrita em arquivo temporário).
- Esteira do APK agora **falha** se aparecer permissão fora da lista, se o release sair depurável ou se targetSdk < 35, e tem a opção `publicar=false` (conferir sem publicar).
- **Build de release de verificação** (execução 43292950617, commit `0dd5935`, `publicar=false`): compilou com R8, ofuscação e assinatura de produção, passou nome/pacote/ícone e a conferência de permissões; **nada foi publicado** (a página de versões continua com os mesmos arquivos). [TESTADO EM AMBIENTE CONTROLADO]
- Esteira do AAB (`aab-comercio.yml`): **preparada e NÃO executada**; exige a frase "AUTORIZADO PELO DONO", roda análise e testes, guarda o `.aab` só como arquivo temporário (7 dias), nunca no Release. O Gradle também recusa gerar `.aab` sem a assinatura de produção.
- O APK **1.0.8 é debug** (não é versão de loja). Os `fortaleza-comercio-8*.apk` ficaram na página de versões e esta sessão não pode apagá-los (o dono pode removê-los).
- Pendente para a Play: conta de desenvolvedor, política de privacidade publicada, formulário de segurança de dados, ficha da loja e capturas de tela, assinatura por Play App Signing (DEPENDÊNCIAS EXTERNAS / do dono).

## 6. Limitações conhecidas (documentadas, não corrigidas)

1. Escrita de aviso que falha é engolida pelo `CaixaDeEntradaService.avisar` (a entrega não é prejudicada; o aviso pode faltar).
2. Em várias instâncias do servidor o aviso pode, em corrida rara, sair em duplicidade.
3. `adminDecidir` (aprovar/rejeitar) não tem trava de concorrência: dois cliques simultâneos gravam duas auditorias.
4. As listas da Central limitam 300 registros antes do filtro de cidade.
5. Loja aprovada pode editar nome/endereço sem nova aprovação (decisão do dono pendente).
6. Dependências com avisos do auditor citadas na seção 2.

## 7. Como foi testado (distinção)

- **Automático:** servidor 28 arquivos / 275 testes; app Comércio 86 testes + `flutter analyze` limpo; rotas: 268 chamadas × 260 rotas ok.
- **Simulado:** despacho/aceite/conclusão com `pedir` falso no formato real; DDL verificado num Postgres embutido (pglite).
- **Ambiente controlado real:** nenhum (sem banco de teste do Prisma nem aparelho).
- **Produção:** nenhuma validação (as rotas só existem lá após o merge e a implantação).
