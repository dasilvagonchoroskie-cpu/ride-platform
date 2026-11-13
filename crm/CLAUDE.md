# CLAUDE.md — CRM Fortaleza Move

CRM web (PWA) para a plataforma de transporte Fortaleza Move: motoristas, passageiros, parceiros, atendimento,
marketing (campanhas), tarefas e planejamento financeiro (cenários e simulações). Interface e mensagens em
**português do Brasil**. Fuso de referência: `America/Sao_Paulo` (Fortaleza, UTC-3, sem horário de verão).

**Pendências:** lista única do que falta em `PENDENCIAS.md` (atualizar a cada entrega: marcar [x] com a data, acrescentar o que surgir).

## Stack e comandos
- Node.js >= 18.17 (testado em 22), Express 4, SQLite via `better-sqlite3` (arquivo em `data/crm.db`, WAL).
- Front-end: SPA em JS puro (ES modules), **sem build**, em `public/`. PWA com service worker.
- `npm ci` · `npm start` (porta 3000) · `npm test` · `npm run key` · `npm run reset -- email` · `npm run backup`
- `npm run test:offline`: harness que roda as rotas reais com substitutos de Express/SQLite. Só funciona **sem**
  `node_modules`; com dependências reais instaladas ele avisa e sai. Não substitui teste com o servidor real.

## Mapa do código
- `server.js` — Express, proxy confiável (`TRUST_PROXY`), checagem de Origin/Sec-Fetch-Site, cabeçalhos, estáticos.
- `src/routes.js` — toda a API (auth, meta, dashboard, relatórios/CSV, financeiro, usuários, CRUD genérico `/:entity`).
- `src/defs.js` — **fonte única** dos módulos e campos (o front e a validação leem daqui via `/api/meta`).
- `src/entities.js` — validação, listagem, criação, edição e exclusão genéricas + histórico de acompanhamento.
- `src/auth.js` — scrypt, sessões (hash SHA-256 do token), chave de instalação, limites de tentativas.
- `src/policy.js` — perfis (`admin`/`gestor`), permissões de exclusão/exportação, parse de `TRUST_PROXY` (puro, testável).
- `src/limiter.js` — limitador em memória (puro, testável). `src/http.js` — cookies, IP, datas (`localDate`), CSV, auditoria.
- `src/schema.sql` — esquema (`CREATE IF NOT EXISTS` a cada start; **não há migrações**).
- `public/js/{app,ui,api}.js` e `public/js/views/*.js` — front. `public/sw.js` — service worker.

## Regras que não podem ser quebradas
1. **Autorização sempre no servidor.** Esconder botão no front é conveniência. Toda rota nova decide perfil em
   `routes.js` (`requireAdmin` ou `policy.*`) e ganha teste.
2. **Perfil ausente/inválido nunca vira admin** (`policy.parseRole`). Privilégio mínimo por padrão.
3. **IP vem de `req.ip`.** Nunca ler `X-Forwarded-For`/`X-Forwarded-Proto` direto. Confiança só via `TRUST_PROXY`.
4. **Sem trancar contas por tentativas** (permite DoS contra o admin). Limites são por origem e respondem igual para
   e-mail existente ou não (sem enumeração).
5. **SQL sempre parametrizado.** Nomes de tabela/coluna só vêm de `defs.js` ou de whitelist. Chaves de objeto vindas da
   URL: usar `Object.prototype.hasOwnProperty.call` (nunca `ENTITIES[param]` direto).
6. **Todo dado do usuário inserido em HTML passa por `ui.esc()`.** Não usar `innerHTML` com dado não escapado.
7. **CSV:** número continua número (prejuízo negativo não pode virar texto); só texto é neutralizado contra fórmulas.
8. **Dados pessoais (LGPD):** exportação só admin e sempre auditada; auditoria registra nomes de campos alterados, não
   valores pessoais; respostas de `/api` com `no-store`; o service worker nunca cacheia `/api`.
9. Segredos nunca no repositório (`data/`, `*.db`, `.env`, chave de instalação estão no `.gitignore`).
10. **Datas:** timestamps são gravados em UTC; comparar/agrupar/exibir sempre no fuso `America/Sao_Paulo` (`localDate` no
   servidor, `ui.fmtDate` no front). Nada de `substr(created_at,1,10)` direto.
11. **Sem scripts inline** (CSP): nada de `onclick=`/`<script>` no HTML; use `addEventListener`.
12. Ao alterar a lista de arquivos do front, **suba a versão do cache** em `public/sw.js` (`fm-crm-vN`).

## Perfis
- `admin`: tudo. `gestor`: lê, cria e edita; exclui só tarefas; não exporta CSV; não acessa configurações, usuários,
  auditoria nem a atividade recente; não exclui cenários/simulações. Mudar regras em `src/policy.js`.

## Menu por público e painel de atendimentos (13/11/2026 tarde, pedido do dono; 2.1.0-rc.7, cache `fm-crm-v35`)
- Menu principal por PÚBLICO: *Passageiros e clientes* 1 passageiro, 2 enviar ou receber uma encomenda; *Comércios* 3 sou comerciante/quero entregas;
  *Motoristas* 4 cadastro, 5 Clube; *Outros* 6. `ASSUNTOS` em `central.js` (ids iguais, números novos). Opções 2 e 3 abrem SEGUNDO MENU
  (`menu_encomendas`: 1 solicitar coleta e entrega, 2 aguardo encomenda, 3 outras; `menu_comercio`: 1 já cadastrado, 2 cadastrar = `abertura_comercio`
  (o mesmo do botão do site), 3 outras). "0" volta ao menu inicial; respostas das opções terminam com `voltar_menu`.
- Estado em `atend_assunto`: `encomendas_menu`/`comercio_menu` = segundo menu ABERTO (só então 1–3 valem como sub-opção; 4–6 voltam ao principal);
  escolhida a opção vira `SUBASSUNTOS` (`encomendas_solicitar|aguardando|outros`, `comercio_cadastrado|cadastrar|outros`, com `pai`). `assuntoBase`,
  `emSubfluxo` (a análise da IA NÃO troca o assunto dentro de subfluxo), `fluxoDe`, `MENUS_SUB`. `comercio_aguardando` (rc.5/6) é lido como `encomendas_aguardando`.
  Cliente que só espera uma encomenda é CLIENTE (encomendas), não comerciante. Menus salvos sem alteração nas versões antigas migram sozinhos (`TEXTOS_ANTIGOS`).
- Painel inicial: `src/atendimento-painel.js` (`resumoAtendimentos`, só leitura, sem texto de mensagem; ignora contatos pessoais/ignorados) → `/dashboard.atendimento_wa`.
  Cada atendimento ABERTO conta em um só grupo: dependem de você (aguardando equipe + humano com o cliente falando por último) | com a IA | aguardando o cliente
  (humano, última fala nossa); concluídos hoje (fuso Fortaleza); por assunto; por motivo de transferência; lista "esperando por você". Cartões abrem Conversas no filtro
  certo (`fm-wa-filtro`). O cartão antigo virou "Registros de atendimento pendentes" (módulo manual). Testes: `test/dashboard-atendimento.test.js`, `test/ia-comercio-menu.test.js`.

## PUBLICADO no Render: 2.1.0-rc.1 (13/11/2026 06h40, autorização formal do dono)
- `etapa2` mesclado no `main` (monorepo `5c2f29f` + `88dd8c2`; backup `117b9f7`); deploy manual do commit `88dd8c2`; migrações 1–7
  aplicadas no banco real; Render com `FM_ETAPA2=1`, `DOCS_STORAGE=supabase`, `DOCS_SUPABASE_URL`, `DOCS_SUPABASE_BUCKET=crm-documentos`,
  `COOKIE_SECURE=true`. Bucket `crm-documentos` PRIVADO (RLS sem políticas). Cópia anterior: `cofre.copia_pre_publicacao` (v3472).
- FALTAM (só o dono): `FM_DOCS_KEY`, `FM_DADOS_KEY`, `DOCS_SUPABASE_KEY` no painel do Render. Sem elas o arquivo digital fica desligado
  (documentos do WhatsApp → equipe). Conferir depois em `/api/admin/saude` (`prova: "ok"`). Detalhes: `docs/PUBLICACAO-RENDER-2026-11-13.md`.
- Seções abaixo marcadas "NÃO está em produção" agora ESTÃO (desde 13/11). Mesclar `etapa2` no `main` não mexe em nada fora de `crm/`
  (logs automáticos do monorepo são restaurados se vierem junto).

## Preparação para a operação real (13/11/2026 manhã, 2.1.0-rc.2, cache `fm-crm-v29`)
- `wa_contatos.pessoal` (db.js ADD COLUMN) + `POST /wa/contatos/:id/pessoal` (só admin, auditado): família/amigos no número do
  atendimento. IA não lê mídia, não analisa, não confirma (aviso) e não responde (`ehPessoal`, motivo `contato_pessoal` em QUIETOS);
  a conversa continua guardada. Front: botão na conversa e no menu "⋯".
- Redação: regras novas em `SISTEMA_RESPOSTA` (informal → 1 frase cordial; insistiu/conhece a equipe → transfere `pediu_humano`;
  pergunta inesperada → `sem_informacao`; nunca "aprovado/liberado/já pode"; sem link/loja/formulário de cadastro) +
  `prometeOuConfirma` dentro de `respostaSegura` (motivo `filtro_promessa`). Testes: `test/ia-operacao.test.js`.

## Novo atendimento e abertura profissional (13/11/2026 manhã, teste real do dono; 2.1.0-rc.3, cache `fm-crm-v30`)
- Store `motivoNovoAtendimento`: NOVO atendimento (saudação + assunto zerados, `atend_inicio` = mensagem) quando a conversa estava
  concluída, OU parada há mais de `ia_nova_conversa_h` (padrão 12; 0 = desligado; tela Configurações → IA), OU o cliente clicou de novo
  num botão do site (`C.ehBotaoDoSite`) com o atendimento já respondido. `mudarAtendimento` aceita `reaberto` com o mesmo estado (evento `reaberta`).
- `encerrarInativas` (varredura da IA): 'ia'/'humano' parados > N h → concluído sem mensagem; 'aguardando' NUNCA (a equipe precisa ver).
- Saudação: 1º contato da vida = `saudacao`; quem já foi atendido = `saudacao_retorno` (todo novo atendimento). Opção do menu escolhida =
  `abertura_<assunto>` (5 modelos editáveis) antes de qualquer redação. Confirmação rápida ("Recebemos…"): só mídia, 1 por atendimento,
  nunca na abertura. `respostaSegura(..., { publicos })`: trecho que também está na conversa/modelos/informações não é "dado interno"
  (falso positivo real: "coleta e entrega de encomendas"). Testes: `test/ia-operacao.test.js`.

## Teste real das 12h20 de 13/11 (2.1.0-rc.4, cache `fm-crm-v32`)
- Causa real: `analisar` mandava ao Gemini as 60 últimas mensagens (histórico de atendimentos ANTERIORES). Um "quero falar com
  um atendente" de ontem → `atendimento.transferir` → novo "Vim pelo site" ia para a equipe. Agora a análise recebe SÓ o
  atendimento atual (`inicioDe`); sem intenção no atendimento → `transferir=false` e `opcao=indefinido` (também com ficha vinculada);
  `responderCentral` só aceita transferência da análise com `intencaoClara`. NÃO voltar a mandar o histórico inteiro.
- Botões do site (`C.botaoDoSite`): resposta fixa (Vim pelo site / corridas e encomendas → menu; motorista → `abertura_cadastro`;
  comércio → `abertura_comercio`, assunto encomendas). Saudação de retorno decidida por id (`id < ultima.id`), não por horário.
- `test/ia-vida-real.test.js`: modelo falso que se comporta como o real (vê "atendente" no texto → transfere); 3 dos 4 testes
  FALHAM na rc.3 (conferido) e passam na rc.4. Teste novo de atendimento deve simular o histórico real, não conversa limpa.
- Lista de conversas abre em "Todas" e lembra o filtro (`fm-wa-filtro`); filtro vazio mostra "Ver todas as conversas".
  Nada é apagado: concluída (inclusive pelo encerramento automático) só sai do filtro "Abertas".

## Avisos na tela (13/11/2026, pedido do dono; cache `fm-crm-v31`)
- `iniciarAvisos` (public/js/notificacoes.js): aviso na tela SÓ para o que chega com o CRM aberto. Ao voltar do segundo plano
  (`visibilitychange`) a busca é silenciosa (só avança `ultimo`): o celular já notificou. Trava `buscando` (duas buscas juntas
  duplicavam), 1 aviso por conversa+tipo, no máximo 2 na tela, 1 som. NÃO voltar a mostrar o acumulado.

## Arquivos do WhatsApp → ficha, versão 2.1.0-rc.1 (13/11/2026, ramo `etapa2`, pedido do dono; publicado em 13/11)
- `src/documentos/recebidos.js` + migração 007 `wa_anexos` (uma linha por mensagem, sem DELETE por gatilho). Situações: aguardando_ficha |
  pendente_classificacao | anexado | duplicado | recusado | falhou | nao_documento. Área de espera CIFRADA (`docs.guardarRecebido/lerRecebido`,
  numero 0); cópia descartada só depois de `docs.anexarRecebido` (usuário de sistema `REQ_WHATSAPP`, só código chama) com SHA-256 conferido.
- Transcritor (routes.js) guarda foto/documento do CLIENTE (nunca `deMim`) mesmo sem leitura; `pareceDocumento` evita guardar foto comum.
  Categoria só por `tipoDocumento` (frente/lado/traseira separados); dúvida = pendente. Evento `vinculo` do store → `recebidos.processar`.
- REGRA: texto NUNCA é comprovante. `marcarDocumentos` só resume/avança etapa a partir dos `doc_*` (que só o arquivo digital muda);
  Central conta `recebidos.categoriasGuardadas` + `doc_*`; sem `recebidos` ativo → transfere `documento_sem_arquivo`. PATCH de `doc_*` = 422.
- Testes da IA usam `test/apoio/recebidos-falso.js` (SIMULAÇÃO); o fluxo real está em `test/wa-anexos.test.js`. `GET /admin/saude`.

## Correções do atendimento por IA e 7 documentos (12/11/2026 noite, ramo `etapa2`, pedido do dono; NÃO está em produção)
- Diagnóstico pelo log de produção (só leitura): áudios caíam com "IA indisponível" na LEITURA (sem nova tentativa) e a conversa ficava
  sem resposta; cada fala levava 2 chamadas ao Gemini + espera de 15 s; `inicioDe(conv)` dependia de colunas que `SELECT_CONVERSA` não trazia.
- Mensagem `tipo='aviso'` (confirmação rápida, `registrarChegada` → `enviarConfirmacao`) NUNCA conta como resposta: `ultimaDoCliente`,
  `mensagensReais`, varredura e limites ignoram; eco do aviso pelo celular vira aviso (store.ingerir/concluirEnvio). NÃO quebrar.
- Áudio: `midiasEmLeitura` (routes marca início/fim), `lerComTentativas` (transcricao.js), `audioIlegivel` → modelo `audio_nao_compreendido`.
- Atendimento: `atend_inicio` (reabertura = mensagem que reabriu), limites por atendimento, `enviar()` reconfere estado/mensagem nova,
  ouvinte `waStore.ouvir` (cancela timers ao assumir/concluir; devolver → `agendarAutomatico`; audita trocas do sistema).
- Origem: `C.origemDoContato` / `C.semIntencao`; `origem_contato`; sem intenção → perfil/assunto indefinidos (analisar e responderCentral).
- Motorista: `DOCUMENTOS_MOTORISTA` em defs.js (7 itens: tipo/categoria/campo/rótulo/pedido) usado por M4, ficha, IA e Central;
  `OBRIGATORIOS_FIXOS` em documentos/service.js (política não retira). Cache `fm-crm-v27`. Testes: `test/ia-atendimento.test.js`.

## Candidatos, avaliador e Hostinger (12/11/2026, ramo `etapa2`, "requisição final"; NÃO está em produção)
- Migração 006 (congelada): `candidaturas` (etapas em `src/candidaturas.js`, CHECK decisao↔etapa, sem DELETE), `candidatura_pareceres`
  e `candidatura_eventos` (append-only por gatilho), `integracao_vinculos|documentos|nonces`. Docs só movem entre cadastro_recebido /
  documentacao_pendente / documentacao_recebida. Decisão: só admin, `confirmo:true`, recusa com motivo; aprovar NÃO contrata a ficha
  nem libera no app (a Central do backend continua liberando). NUNCA aprovação automática.
- Perfil `avaliador` (`policy.ROTAS_AVALIADOR`, guarda logo após `requireAuth`): só candidatos, parecer e documentos no escopo
  (`docs_politica.avaliador` + candidatura existente). Nunca admin. Rota nova para ele = entrar na lista + teste. `rotas-permissoes.test.js`
  falha se alguma rota escapar da lista.
- SEM integração com o aplicativo do motorista (decisão do dono, 12/11 noite): a entrada assinada foi RETIRADA (rotas, `src/integracao.js`,
  exceção em `docs.anexar`). Os dois caminhos são independentes: app → Central (aprovação lá); CRM → ficha/documentos/avaliação, e o dono
  usa a ficha para preencher o cadastro na Central. Tabelas `integracao_*` da 006 ficam vazias (migração congelada). NÃO recriar.
- IA: só Gemini, sem reserva (decisão do dono); `INFO_EXTRAS` (entregadores, comerciantes) + `situacaoInformacoes()`; nada inventado.
- Hostinger: `deploy/hostinger/` (guia + scripts, nada executado); `SNAPSHOT_MODO=copia` em `persist.js`. Cache `fm-crm-v26`.

## M2 entregadores e relatórios em PDF (12/11/2026, ramo `etapa2`, pedido do dono)
- `entregadores`: módulo funcional como o motorista (mesmas situações, `Contratado` verde, documentos, `modalidade`), só existe em
  `ENTITIES` com `FM_ETAPA2=1` (migração 003). Mesma pessoa pode ser motorista e entregador. `POST /entregadores/:id/contratar`.
  A IA não cria entregadores e não marca os documentos deles (só motorista).
- PDF: `src/pdf/documento.js` (escritor de PDF sem dependência, Helvetica/AFM, PNG com transparência), `src/pdf/relatorio.js`
  (layout padrão: identidade, filtros, indicadores, tabelas com totais, aviso de lista vazia, rodapé LGPD) e `src/relatorios-pdf.js`
  (modelos por setor). Rota `GET /reports/pdf` (antes de `/:entity`); filtros iguais aos da lista via `entities.montarFiltro`.
- Permissão: `policy.canExportPdf` (admin tudo; gestor só tarefas/campanhas/resumo/financeiro/cenario). CSV segue só admin. Toda
  exportação é auditada. Novo relatório = novo modelo em `relatorios-pdf.js` + permissão em `policy.js` + teste em `test/m2-pdf.test.js`.
- Front: `public/js/exportar.js` (`abrirExportacao`: baixar, abrir/imprimir em nova aba, compartilhar, CSV). Sem iframe (CSP).
  Cache do app `fm-crm-v21` (etapa2; v22 no M3).
- "Simulação incompleta" = `custos_total` não maior que zero (mesma regra da tela do financeiro).

## Auditoria geral de 12/11/2026 (ramo `etapa2`, pedido do dono; NÃO está em produção)
- IA: causa da falha real de 12/11 12:27 = provedor 5xx sem nova tentativa (log de produção: "análise automática da conversa 1: O serviço de
  IA está indisponível agora"). `executarAutomatico` agora marca `wa_conversas.ia_estado` (processando|tentando|respondida|transferida|
  transferida_falha|sem_acao|analisada|falhou|sem_chave|limite), `ia_erro` (só código), `ia_msg_id`, `ia_tentativas`, `ia_proxima`.
  Erros passageiros (`PASSAGEIROS`) repetem por `IA_REPETIR_MS`; no fim, ou com motivo que não é silêncio intencional (`QUIETOS`), chama
  `transferirPorFalha` (só se a conversa está com a IA e a última mensagem é do cliente). `recuperarPendentes` (varredura) é idempotente:
  pega só conversa 'ia' cuja última mensagem é do cliente e ainda não tratada / tentativa vencida / processamento preso > 5 min.
  NÃO quebrar: humano assumiu → IA quieta; eco não conta; resposta da IA ainda passa por `respostaSegura`. Testes: `test/ia-recuperacao.test.js`.
- Ícones: nada de "FM" em texto como marca; usar `/icons/logo.png`. Selo do push: `/icons/badge-96.png`. Cache `fm-crm-v25` (etapa2).
- Documentos: `cifra.impressao()` + setting `docs_chave_impressao`; chave diferente → 503 `armazenamento_indisponivel` (não "integridade").
- Toda rota nova entra sozinha em `test/rotas-permissoes.test.js` (lê o código): protegida por login e, se `requireAdmin`, 403 para gestor.
- No backup (`CRM-Fortaleza-move-`), o `app-twa` do etapa2 estava com os ícones ANTIGOS (o commit e635709 do ícone novo só estava no main):
  igualado ao main em 12/11.

## Revisão da exportação nos Relatórios (12/11/2026, ramo `etapa2`, pedido do dono; NÃO está em produção)
- Um só caminho de exportação: `abrirExportacao` (front) → `GET /reports/pdf` (`relatorios-pdf.js`) e `GET /reports/export` (CSV, só admin).
  Nenhum relatório novo cria PDF por fora: novo bloco = modelo em `relatorios-pdf.js` + `policy.canExportPdf` + teste em
  `test/relatorios-exportacao.test.js`. Tela (`reportSummary`), PDF e CSV precisam do mesmo critério de data e dos mesmos totais.
- Datas de timestamp em PDF/CSV: `localDate` (UTC-3), nunca `slice(0, 10)`. Documentos: período pela data de inclusão local.
- PDF de período leva o período no nome do arquivo; simulações e cenários sempre como "estimado/estimada"; aviso de que não é receita realizada.
- Gestor: PDF só de tarefas, campanhas, resumo, financeiro e cenário; atendimentos e listas de pessoas/documentos ficam só com o admin; CSV só admin.
  Cache do app `fm-crm-v24` (etapa2).

## M3 comércios (12/11/2026, ramo `etapa2`, pedido do dono; NÃO está em produção)
- `comercios`: módulo funcional como entregadores, só em `ENTITIES` com `FM_ETAPA2=1` (migração 004, congelada). Titular = EMPRESA central
  (`FUNCOES.comercio` em `src/titulares.js`, nome do titular vem de `nome_estabelecimento`). Independente de `parceiros` (Clube): decisão
  do dono em 12/11 ("dois cadastros diferentes"); mesma empresa pode ter as duas funções, 409 se repetir a mesma.
- `pessoas.criarRegistro` copia `razao_social` e `endereco` do registro para a empresa quando vazios. Sem campo de CNPJ (M4).
- Situações em `STATUS_COMERCIO`; fechado = 'Ativo na plataforma' (verde), perdido = 'Não concretizado'. `POST /comercios/:id/ativar`
  (admin e gestor, `confirmo:true`). `fichaDoCadastro` e `/relations` conhecem 'comercios'; dashboard `comercios_*`; `reportSummary.comercios`.
- PDF `type=comercios` em `relatorios-pdf.js`; `policy.canExportPdf`: só admin (gestor não exporta lista com dados pessoais); CSV só admin.
- IA: `CAMPOS_IA.comercios` (pode preencher campos vazios de comércio vinculado), nunca cria comércio. WhatsApp: `VINCULOS.comercios`.
- Front: menu Comércios, banner "comércio pedindo entregas", botão "Marcar como ativo na plataforma", cartões no dashboard e em Relatórios.
  Cache do app `fm-crm-v22` (etapa2). Testes: `test/m3-comercios.test.js`.

## M4 documentos e armazenamento (12/11/2026, ramo `etapa2`, pedido do dono; NÃO está em produção)
- `documentos` / `documento_versoes` / `documento_eventos` (migração 005, congelada; eventos append-only e versões imutáveis por gatilho; sem DELETE).
  Documento = `funcao` (motorista|entregador|parceiro_clube|comercio) + `registro_id`; um por categoria (índice parcial), "outros" ilimitado.
  `src/documentos/`: `service.js` (regras, permissão, eventos, auditoria), `cifra.js` (AES-256-GCM por arquivo, `FM_DOCS_KEY`),
  `armazenamento.js` (local/supabase; nunca sobrescreve; recusa disco efêmero), `validacao.js` (assinatura, extensão, tamanho, PDF ativo),
  `manutencao.js` (verificar/backup/restaurar). Arquivos NUNCA entram no retrato do cofre (`persist.js` IGNORAR `documentos`).
- Regras: conferir NUNCA muda a situação da função (`sincronizarLegado` só mexe em `doc_*`/`documentos`); permissão no servidor
  (`policy.docs*`, política em setting `docs_politica`: gestor só anexa por padrão; ver/conferir por categoria liberada; exclusão definitiva
  desligada); todo acesso/negação/integridade vira evento + auditoria; CPF/CNPJ só cifrado, só admin, coleta desligada por padrão.
- Decididos em 12/11: 7 documentos obrigatórios do motorista (ver acima); manter TODAS as versões; armazenamento definitivo no disco da VPS Hostinger (na migração). Pendentes: o que o gestor vê;
  quais CPF/CNPJ exigir; prazo de retenção. Sem exclusão automática. `FM_DOCS_KEY` precisa existir antes de qualquer uso real.
- Front: `public/js/documentos.js` (painel por ficha, tela Documentos, política, bloco CPF/CNPJ); cache `fm-crm-v23`. Testes: `test/m4-documentos.test.js`.

## Ficha do motorista e "fechados" em verde (10/11/2026, pedido do dono)
- Motorista: situação nova `Contratado` (fechado), documentos por item `doc_cnh`/`doc_crlv`/`doc_endereco` (Não enviado /
  Recebido — conferir / Conferido) + resumo `documentos` (Não enviados / Incompletos / Recebidos — conferir / Conferidos),
  `endereco` (a IA preenche pelo comprovante), `contratado_em`. `defs.js`: `fechados`/`perdidos` por módulo (motorista
  Contratado, parceiro Parceria confirmada, passageiro Usuário cadastrado); listagem aceita `etapa=andamento|fechados`.
- `marcarDocumentos` (`src/ia/service.js`) marca o que chegou (`tipoDocumento`/`documentosRecebidos` em
  `src/ia/documentos.js`, pela linha "Tipo:" do 📎) e move a etapa; nunca desfaz "Conferido". A Central pede CNH, CRLV e
  comprovante de endereço e transfere ("documentos") com os três.
- `POST /motoristas/:id/contratar` (admin e gestor, `confirmo:true`). `GET /:entity/:id` devolve `ficha`
  (`fichaDoCadastro` em routes.js). Front: abas Em andamento/✅ Fechados/Todos, linha verde (`linha-fechada`), badge
  `fechado`, "Ficha do motorista" em `entity.js`. Testado: seguranca.test.js + navegador (celular) com canal/IA falsos.

## Ícone novo (11/11/2026 noite, escolhido pelo dono)
- Logo hexagonal "FM" (azul, ciano e dourado), fundo transparente. Gerados de um original 1254×1254: `public/icons/`
  (icon-192/512 transparentes, icon-maskable-512 e apple-touch com fundo branco, favicon-32.png, logo.png para a barra
  lateral e o login em `.brand-mark` com fundo branco) e, no app Android (repo de backup, `app-twa`): ícone adaptável
  (`mipmap-anydpi-v26`, fundo branco + logo na zona segura), `splash_logo` com abertura em fundo branco e `ic_notificacao`
  (silhueta branca, PNG por densidade). APK 2.0.107. Cache do app v19 (main) / v20 (etapa2).
## Etapa 2 — preparação (ramo `etapa2`, 11/11/2026; NÃO está em produção)
- Trabalho no ramo git `etapa2` (ride-platform e backup). `main` é o que vai para o Render: nada da Etapa 2 entra em
  `main` nem em deploy antes da autorização do dono (depois do teste das notificações no celular).
- Migrações versionadas: `src/migracoes/index.js` (tabela `schema_migracoes` com checksum; cada migração numa transação
  com `verificar()` + foreign_key_check; integrity_check antes/depois; recusa código alterado ou banco mais novo).
  Só rodam com `FM_ETAPA2=1` (db.js), com cópia em `data/backups/pre-migracao-*` antes de cada uma. Migrações são
  CONGELADAS: nunca editar uma já aplicada; mudança = migração nova.
- 001: `pessoas`/`empresas` (uid permanente, `telefone_chave` só para achar duplicado, CPF/CNPJ só cifrados com
  finalidade), `vinculos` (titular pessoa|empresa × função motorista|entregador|passageiro|parceiro_clube|comercio ×
  registro funcional; 1 ativo por função; 1 titular por registro; CHECK de compatibilidade), `titulares_eventos`.
- 002: liga os cadastros atuais sem alterá-los (une só mesmo telefone + mesmo nome em funções diferentes; o resto fica
  separado e aparece no relatório).
- Só leitura: `src/duplicados.js` (`GET /api/admin/duplicados`, admin, auditado, telefone só com 4 dígitos),
  `GET /api/admin/migracoes`; `scripts/simular-migracao.js <crm.db>` (cópia em memória; o original não muda).
- `src/protegidos.js`: CPF/CNPJ com AES-256-GCM + índice HMAC (`FM_DADOS_KEY`, 64 hex, fora do repositório); sem
  chave não grava. Nenhuma tela coleta ainda. Testes: `test/migracoes.test.js`.
- M1 telas (11/11): `src/pessoas.js` (serviço) + rotas em routes.js, todas atrás de `pessoas.ativa()` (FM_ETAPA2=1 e
  tabelas existentes; senão 404): `GET /pessoas` (busca), `GET /pessoas/:id` (ficha central: funções ativas e encerradas,
  eventos, possíveis duplicados), `POST /pessoas/verificar-telefone` (só aviso), `POST /pessoas/:id/funcoes` (adicionar
  função compatível; 409 se já tem), `GET /pessoas/duplicados` e `POST /pessoas/juntar` (só admin, `confirmo:true`,
  `principais` para função repetida; nada apagado: a juntada vira `mesclada`, vínculos passam, ficha repetida é
  ENCERRADA). Com a Etapa 2 ligada, `POST /:entity` de motoristas/passageiros/parceiros cria o registro + pessoa/empresa
  na mesma transação (`pessoa_id` opcional = o usuário escolheu); `DELETE` encerra o vínculo. `GET /:entity/:id` traz
  `titular`. `/meta` traz `etapa2` (catálogo de funções). Front: `public/js/views/pessoas.js` (#/pessoas, ?id=, ?duplicados=1),
  aviso de telefone no formulário de motorista/passageiro (`escolherPessoa` em entity.js), `?abrir=ID` abre uma ficha,
  `ui.modal({ onClose })`. Testes: `test/pessoas.test.js`.
- Complemento do M1 (11/11 noite): `pessoas.js` é genérico por titular (`TIPOS.pessoa|empresa`; funções `*Titular`); as
  funções antigas (`listar`, `ficha`… de pessoa) continuam. Rotas `/empresas*` iguais às de pessoas (gestor consulta,
  cria e adiciona função; duplicados/juntar só admin, auditado com entity `empresas`); `POST /parceiros` aceita
  `empresa_id`. Ficha central (pessoa e empresa) traz `historico_funcoes`: lê os históricos ORIGINAIS de cada ficha
  (interacoes, tarefas, conversas do WhatsApp do contato ligado, auditoria só para admin) direto das tabelas de sempre,
  inclusive de fichas encerradas; o histórico central (`titulares_eventos`) só registra o que acontece a partir da
  Etapa 2. Busca de pessoas/empresas ignora acento e maiúscula. Menu "Empresas". Teste de preservação em
  `test/migracoes.test.js` (impressão digital das tabelas de histórico igual antes/depois da migração e da junção).

## Ordem de serviço de 11/11 tarde (dashboard, push, financeiro, APK)
- Dashboard: `motoristas_interessados` agora é só 'Novo interessado' (antes era o TOTAL e incluía contratados);
  `motoristas_total`, `motoristas_docs_a_conferir` novos; card "Motoristas contratados". Financeiro saiu do Dashboard.
- Push: `urgency: 'high'` para todos os tipos (normal/low ficavam retidos no Android em Doze), TTL 6 h (transferência 24 h);
  `MAX_FALHAS` 8; log `[notificações] push <tipo>: N entregue(s)...` e contagem de inscritos ao ligar; sw não mostra
  notificação com o CRM visível; feed não toca som de aviso com mais de 1 min; `sincronizarPush` refaz inscrição com chave antiga.
- Financeiro (`finance.js`): blocos Receita / Custos / Resultado, "Simulação incompleta" sem custos.
- APK: `ManageDataLauncherActivity` declarada no manifesto do app-twa (a biblioteca cria o atalho "Configurações do site"
  apontando para ela; faltava no manifesto → erro "Component class ... does not exist").

## E-mail de acesso e recuperação na tela de login (11/11/2026, pedido do dono)
- Login com botão "Esqueci minha senha" visível; sem e-mail configurado a tela mostra os caminhos alternativos
  (`/auth/status.recuperacao_email`). `PATCH /users/:id` aceita `email` (admin; 422 inválido, 409 repetido; derruba as
  sessões do outro usuário). `FM_TROCAR_EMAIL=antigo>novo` em start.js troca sem entrar (auditado; apagar depois).
- E-mail de acesso do dono: fortalezamovegtba@gmail.com (11/11). Envio de e-mail depende da chave Resend (conta criada
  pelo dono com esse mesmo e-mail; sem domínio, o Resend só entrega no e-mail da própria conta).

## Notificações (10/11/2026, pedido do dono)
- `src/notificacoes.js`: o store do WhatsApp avisa eventos (`store.ouvir`: mensagem recebida, envio da IA, mudança de
  atendimento) e o notificador gera 3 tipos: 💬 mensagem nova, 🤖 IA respondeu (discreto), 🚨 transferência para a equipe
  (urgente, com o motivo). Cada um vira item do feed (`notificacoes`, 7 dias) e Web Push (`web-push` 4.0.0, chaves VAPID
  em `data/vapid.json`, inscrições por aparelho em `push_inscricoes` com os tipos escolhidos). Mensagem/IA: no máximo 1
  push por conversa por minuto. Endpoint de push só de serviços conhecidos (FCM, Mozilla, Windows, Apple): evita SSRF.
  Rotas: `GET /notificacoes?desde=`, `GET /push/config`, `POST /push/inscrever|cancelar|teste` (qualquer usuário logado).
- Front: `public/js/notificacoes.js` (sons gerados por WebAudio, diferentes por tipo; aviso clicável que abre a conversa
  `#/conversas?c=ID`), `sw.js` (push + clique), cartão "Notificações" em Configurações.
- App Android virou Trusted Web Activity (repo CRM-Fortaleza-move-, `app-twa/`, androidbrowserhelper): abre o CRM pelo
  Chrome, então o push chega com o app fechado; `NotificacoesService` escolhe o canal pelo emoji do título (alarme,
  "plim", silencioso). O servidor publica `/.well-known/assetlinks.json` (`TWA_PACOTE`, `TWA_SHA256`; padrão = assinatura
  de `app/assinatura/debug.keystore`). Mesmo pacote do app Flutter antigo, mas **assinatura diferente**: os APKs 1.0.x
  foram assinados por uma chave gerada a cada montagem no GitHub (1.0.1, 1.0.3 e 2.0.105 têm certificados diferentes),
  então o Android NÃO instala o 2.0 por cima do 1.0.x: desinstalar o antigo uma vez. Do 2.0.105 em diante a chave é fixa
  (`app/assinatura/debug.keystore`, SHA256 3B:61:…:1C:99) e as próximas versões instalam por cima.
- Etapa 1 da ordem de 11/11 (diagnóstico): o dono continuava no app 1.0.3 (WebView: sem PushManager, só a permissão
  INTERNET, tela mandando abrir no Chrome). Correções: `ambiente()` em `notificacoes.js` (app novo pelo `document.referrer`
  android-app://, app antigo pelo `; wv)`), aviso do app antigo e da permissão do Android no cartão, linha "Diagnóstico";
  `sincronizarPush()` ao abrir o CRM e `pushsubscriptionchange` no sw renovam a inscrição (`renovar:true` mantém as
  escolhas; `anterior` troca o endereço). Teste em aparelho físico: só o dono pode fazer (roteiro no arquivo-mestre).

## Mudança de conta (09/11/2026)
- O dono perdeu o acesso às contas da Fortaleza Move (vendeu o celular). O CRM foi montado de novo, do zero, nas contas
  pessoais dele: Render "Evandro's workspace" (serviço `crm-fortaleza-move`, srv-dbp6u4utlv9c73en3b0g, Oregon,
  https://crm-fortaleza-move-ilv9.onrender.com, auto-deploy DESLIGADO: publicar com deploy manual) e Supabase org
  dasilvagonchoroskie-cpu, projeto `crm-fortaleza-move` (ref jjrcfoxhzpaguskeywkf, us-west-1). Dados antigos ficaram no
  cofre da conta antiga (cifrados): não há como trazer sem a SNAPSHOT_KEY antiga. Instalação nova: admin, WhatsApp e
  chave do Gemini cadastrados de novo.
- SQL do cofre agora versionado em `supabase/cofre.sql` (antes só existia no Supabase antigo).
- Mesma conta Render tem o `fortaleza-mov-backend` mantido acordado 24 h: o plano grátis dá 750 h/mês POR CONTA.
  Dois serviços acordados 24 h estouram (~1440 h) e o Render suspende os dois até o mês seguinte.
  Decisão do dono (09/11, temporária até contratar Hostinger): CRM acordado 24 h (pg_cron `crm-manter-acordado` no
  projeto do CRM, a cada 10 min) e o cron `manter-servidor-acordado` do backend (projeto fortaleza-mov-eua) DESATIVADO
  (cron.alter_job active=false; reativar com active := true). O backend dorme quando ninguém usa e acorda no 1º acesso.

## Hospedagem no Render grátis + cofre (05/11/2026)
- Render grátis tem disco temporário (apaga tudo a cada reinício/deploy/hibernação) e hiberna após 15 min sem acesso.
- Solução: `start.js` + `src/persist.js`. Ao ligar, restaura `data/` (banco, `wa-auth`, chaves da IA) de um retrato
  **cifrado (AES-256-GCM)** guardado no Supabase (projeto Supabase `crm-fortaleza-move`, ref `jjrcfoxhzpaguskeywkf` desde 09/11; antes `xefeimjmvofeujcqlnuv`,
  esquema `cofre`, funções `crm_snapshot_assumir/gravar` protegidas por token). Envia retrato novo a cada 30 s quando
  algo muda e no SIGTERM. **Fail-closed:** se o cofre não responder, o CRM não sobe (nunca sobe vazio por cima).
  Processo antigo de um deploy não grava por cima do novo ("dono").
- Variáveis: `SNAPSHOT_URL`, `SNAPSHOT_ANON` (chave publicável), `SNAPSHOT_TOKEN`, `SNAPSHOT_KEY` (64 hex; perder =
  perder os retratos). Valores no arquivo-mestre `PROJETO-crm-fortaleza-move.md`.
- Janela de perda aceitável: até ~30 s de alterações se o Render matar o processo sem aviso.
- Sem terminal no Render: recuperação de senha por `FM_RESET_EMAIL` (o código sai no log ao ligar; apagar depois).
- Biblioteca do WhatsApp instalada no build do Docker em `/opt/wa-lib` (`WA_LIB_DIR`). Hibernado, o WhatsApp não recebe
  na hora; ao acordar, o WhatsApp entrega o que ficou pendente.
- Código no monorepo `dasilvagonchoroskie-cpu/ride-platform`, pasta `crm/` (fora do workspace pnpm). Docker: `crm/Dockerfile`.

## Correções da auditoria de segurança (06/11/2026) — relatório: doc "Auditoria de Segurança — CRM Fortaleza Move"
- Cofre: aceita mais de um token durante troca (`cofre.acesso` com vários hashes); `SNAPSHOT_KEY_ANTERIOR` abre retrato
  antigo na troca de chave; histórico de versões em `cofre.historico` (1/hora por 48 h, 1/dia até 15 dias; sem função de
  apagar exposta). Restaurar versão antiga: SQL no Supabase (copiar `dados` do histórico para `cofre.snapshot`).
- Resposta automática: SEGUNDA chamada só para redigir (`SISTEMA_RESPOSTA`, sem nenhum dado do cadastro) + filtro
  `respostaSegura` (bloqueia números de documento, links/e-mails e trechos de anotações internas). Motivo vai ao painel.
- Verificação em duas etapas (TOTP, RFC 6238, sem dependência) para qualquer usuário: `/auth/2fa/*`, login em 2 passos
  (`/auth/login/codigo`, desafio de uso único 5 min/5 tentativas, código não reutilizável, código de recuperação vale).
  Admin desliga a de outro usuário (celular perdido). Sessão expira por inatividade (`SESSAO_INATIVIDADE_MIN`, 60).
- Mídia: download em fluxo com corte em 15 MB; limite por contato (`IA_LEITURAS_CONTATO_DIA` 15, `IA_ANALISES_CONVERSA_DIA` 25);
  números de documento mascarados no texto lido (`mascararNumeros`, mantém 3 últimos dígitos).
- Motorista: campo `documentos` (Não enviados / Recebidos — conferir / Conferidos), marcado pelo SERVIDOR quando dados de
  documento entram; aprovação continua humana.
- Retenção (LGPD): conversas sem cadastro e sem movimento há `RETENCAO_DIAS` (180) apagadas; análises/registros antigos também.
- Baileys com versão fixa (`wa-lib/package.json` + lock, 7.0.0-rc14). Endereço "personalizado" da IA recusa rede interna em produção.
- `/api/diagnostico/ip` só existe com `DIAG_IP=1` (usar e desligar).
- Limpeza feita em 06/11 10h20: token antigo apagado de `cofre.acesso` (só o novo vale), versões anteriores à troca de chave
  apagadas, `pg_net` reinstalado no esquema `extensions` (job `crm-manter-acordado` conferido: 200).

## Central de Atendimento Inteligente (06/11/2026, pedido do dono)
- Estados da conversa em `wa_conversas.atendimento`: `ia` | `aguardando` (transferida, motivo em `atend_motivo`) | `humano` |
  `concluido` (= situacao 'Resolvida'). Assunto do menu em `atend_assunto` (cadastro|passageiro|encomendas|clube|outros).
  `saudado_em` garante uma saudação por atendimento; `espera_em`, um aviso de espera por período. Histórico em `wa_eventos`
  (sem texto do cliente). Colunas acrescentadas por `db.js` (conversas antigas com resposta já contam como saudadas).
- Orquestrador: `responderCentral` em `src/ia/service.js` (com trava por conversa). Ordem: humano/concluído → quieta;
  aguardando → 1 aviso de espera; saudação (1ª vez); transferência (pedido de atendente por regex OU análise
  `atendimento.transferir` OU redação `transferir`); documento 📎 → confirmação do modelo + pede o que falta (CNH/CRLV) ou,
  completo, transfere com motivo "documentos"; menu (1º contato sem assunto ou "menu"); senão, redação com o fluxo do
  assunto (`FLUXOS`) e as informações oficiais. Textos fixos dos modelos NÃO passam por `respostaSegura` (são do admin);
  a redação da IA continua passando.
- Quem responde pelo CRM ou pelo celular assume (`humano`); eco do envio da IA/CRM não conta. Volta sozinha para `ia` depois de
  `ia_humano_pausa_min` (padrão 30; 0 = só pelo botão) sem mensagem da equipe — pedido do dono (ele responde pelo celular). Cliente que escreve depois
  de concluído reabre com a IA (saúda de novo só se concluiu há mais de 12 h). Rotas: `POST /wa/conversas/:id/atendimento`
  (assumir|devolver|concluir, admin e gestor), `GET /ia/modelos` (todos), `PUT /ia/modelos` (só admin).
- Modelos (`src/ia/central.js`, setting `central_modelos`): saudacao, menu, confirmacao_documentos, confirmacao_informacoes,
  transferencia, espera, encerramento ({site_oficial}), site ({site}); site em `central_site_url` (só https);
  base de conhecimento `central_info_<assunto|geral>`. Tela: card "Modelos de Comunicação da IA" em Configurações.
- Testado: `test/central.test.js` + permissões em `seguranca.test.js` + navegador (Chrome, tela de celular) com canal e IA falsos.

## Verificação por e-mail (06/11/2026, pedido do dono)
- O dono não quer guardar códigos/token: o padrão agora é **código por e-mail só em aparelho novo** (`email_2fa`, tabela
  `dispositivos`, cookie `fm_disp` 180 dias) e **"Esqueci minha senha" por link no e-mail** (`/auth/recover/email`).
  TOTP e códigos de recuperação continuam opcionais. Aparelho confiável também pula o TOTP.
- Envio: `src/email.js`, por API HTTPS (Render grátis bloqueia SMTP 25/465/587 desde 26/09/2025): Resend
  (`RESEND_API_KEY`; sem domínio só entrega no e-mail da conta Resend) ou Brevo (`BREVO_API_KEY` + `EMAIL_FROM`).
  Testes usam `EMAIL_TESTE_ARQUIVO` (ignorado em produção).
- Anti-tranca: ativar exige receber um código; e-mail fora do ar → aparelhos já confirmados continuam entrando;
  `FM_RESET_EMAIL` desliga a verificação da conta além de gerar o código de senha nova.

## Ajustes de 06/11/2026 (teste real do dono)
- Sem cadastro vinculado, a IA recebe `campos_permitidos` por perfil (`camposPorPerfil`) e pode devolver qualquer chave de
  `CHAVES_SEM_CADASTRO`; o cadastro criado já nasce com veículo/placa/CNH (antes só nome/cidade).
- Foto/PDF de documento: prompt de EXTRAÇÃO (`INSTRUCAO_DOCUMENTO`, campos fixos de CNH e CRLV), não de descrição.
  Reforço sem IA (`src/ia/documentos.js`): categoria da CNH, placa e veículo tirados das linhas 📎 quando a IA não devolve;
  categoria/placa normalizadas para o formato do cadastro.
- Cada execução automática registra no log (só nomes de campos e decisões) e, quando não responde, o motivo vai para
  `aplicado_resumo` (aparece no painel). Trava "equipe respondeu": 15 min.
- Resposta automática (ver regras da IA). Tela de conversa: painel da IA recolhido em uma linha por padrão; no celular,
  área de mensagens com pelo menos 45% da tela e botões de ação numa linha só.

## Leitura de mídias (06/11/2026)
- Além do áudio: foto, PDF e vídeo são lidos pelo Gemini (descrição + texto visível; documentos como CNH/CRLV viram
  linhas "Campo: valor"); Word/Excel/PowerPoint (.docx/.xlsx/.pptx) e texto/CSV são lidos NO SERVIDOR (`src/ia/office.js`,
  leitor de ZIP sem dependência, com limite contra zip bomb) e não gastam cota. Localização vira texto com link do mapa;
  contato compartilhado vira nome + telefone. Formatos antigos (.doc/.xls) e executáveis não são lidos.
- Texto lido entra na mensagem com 📎 (áudio com 🎤); o prompt trata os dois como dados da pessoa e nunca como instrução.
- Motorista ganhou `veiculo`, `placa`, `cnh_categoria` (a IA pode preencher). `db.js` acrescenta sozinho colunas novas
  (opcionais) de `defs.js` em bancos antigos — só ADD COLUMN, nunca altera/apaga.

## Transcrição de áudio (05/11/2026)
- Mensagem de voz que chega (do contato ou enviada pelo celular) é baixada (`downloadMediaMessage`), transcrita e o
  texto da mensagem vira `[mensagem de voz] 🎤 <transcrição>`. `src/ia/transcricao.js`: Gemini (API nativa
  generateContent, áudio embutido, chave no cabeçalho `x-goog-api-key`) e Groq Whisper como reserva grátis.
- Liga com a IA ativada + opção "Transcrever mensagens de voz" (`ia_transcrever`, padrão ligado). Limite diário
  `IA_LIMITE_TRANSCRICOES` (300). Registro em `ia_transcricoes`. Áudio até 15 MB/15 min.
- A IA automática só é chamada DEPOIS da transcrição (com `forcar`), para ler o texto. Áudios recebidos antes desta
  versão não têm como ser transcritos (o CRM não guardava a referência do arquivo).
- NÃO validado com WhatsApp real ainda (primeiro áudio real é o teste).

## IA grátis (05/11/2026)
- Provedores com plano grátis sem cartão: **Gemini** (padrão de instalação nova; modelo descoberto sozinho, preferindo
  `flash-lite` estável) e **Groq** (`openai/gpt-oss-120b`); OpenRouter tem modelos `:free`. `reasoning_effort: low` e piso
  de tokens para modelos que "pensam". 429 do plano grátis: espera e tenta 1 vez. **Provedor reserva** (`ia_reserva`):
  usado só em sem cota/fora do ar/sem saldo, cada um com a própria chave.
- Gemini grátis: o Google pode usar as conversas para melhorar os produtos (aviso na tela).

## Estado anterior (03/11/2026)
- Duas rodadas de auditoria e correção aplicadas (ver `AUDITORIA-CORRECOES.md`, "Segunda rodada" e "Terceira rodada").
- Canal do WhatsApp (recebimento, conversas, envio, fila) implementado sobre adaptador; ver seção abaixo.
- Validado: `npm test` (40 testes) e `npm run test:offline` (214 verificações) passando; sintaxe de todo o JS.
- **Nunca rodou com Express e better-sqlite3 reais** (ambiente sem rede). Nada foi testado em navegador (as telas
  alteradas na terceira rodada só passaram por checagem de sintaxe), nem em HTTPS, proxy, PWA instalada, restauração de
  backup, nem `npm audit`. A CSP nova pode bloquear algo que só aparece no navegador: abrir o console e conferir.
- A chave de instalação compartilhada anteriormente deve ser tratada como exposta: gerar nova em instalação limpa.

## Roteiro de implantação (próximos passos)
1. `npm ci && npm test && npm audit` (corrigir vulnerabilidades relevantes; conferir compilação do `better-sqlite3`).
2. Escrever **teste de integração real** (subir `server.js` em porta livre com `FM_DATA_DIR` temporário e usar `fetch`)
   reproduzindo os cenários do harness: setup com chave certa/errada/fechado; login errado até 429; outro IP entra;
   e-mail inexistente responde igual; criar usuário sem perfil → gestor; perfil inválido → 422; gestor 403 em excluir
   motorista, exportar, `/settings`, `/audit`; gestor exclui tarefa; tarefa vinculada mantém o vínculo; recuperação de
   senha com link e código; admin exporta CSV; simulação negativa exporta como
   número; campanha só com data de publicação aparece no CSV; `/api/constructor` → 404; sem sessão → 401.
3. Homologação com dados fictícios no navegador: fluxo completo, botões por perfil, Configurações como gestor, editar
   tarefa vinculada, kanban, recuperação de senha (link e código), salvar simulação com premissas não salvas, console sem
   erros de CSP, instalação PWA (HTTPS) e, após novo deploy, o app atualizando sozinho (service worker v2).
4. Hospedagem: HTTPS (proxy reverso), `TRUST_PROXY` correto (`loopback` se Nginx na mesma máquina; `1` ou IP/sub-rede
   se em outro host/container), `COOKIE_SECURE=true`, `HOST=127.0.0.1` atrás do proxy, `PUBLIC_URL` (link do `npm run reset`), volume persistente para `data/`,
   processo supervisionado (systemd/Docker), `npm ci --omit=dev`.
5. Banco: SQLite em volume persistente é suficiente para o porte atual. Se houver necessidade de várias instâncias ou
   alta concorrência, avaliar PostgreSQL (exigiria camada de acesso e migrações). Decidir antes de crescer.
6. Backup diário (`npm run backup`) copiado para fora do servidor, com criptografia e rotação; **testar a restauração**.
7. Criar o administrador (chave nova), depois os gestores pela tela Configurações.

## WhatsApp (em andamento) e IA (próxima etapa)
Plano, decisões e marcos em **`PLANO-IA-WHATSAPP.md`**. O dono decidiu usar o **pareamento por código ("Dispositivos
conectados")**, no número principal, sabendo do risco de bloqueio (método não oficial). A via oficial (Meta, coexistência)
ficou como migração futura: por isso o canal é um **adaptador** (`src/whatsapp/`):
- `store.js` (conversas, mensagens, fila, vínculo por telefone), `service.js` (liga/desliga, fila de envio),
  `routes.js` (`/api/wa/*`), `baileys-channel.js` (conector real), `fake-channel.js` (testes/demonstração), `phone.js`.
- Front: `public/js/views/whatsapp.js` (tela Conversas) e cartão em Configurações (`setupWhatsapp` em `settings.js`).
- A biblioteca (Baileys) é instalada à parte em `data/wa-lib` (`scripts/instalar-whatsapp.sh`); sem ela o CRM roda normal.
- **Regras:** código específico do WhatsApp só em `src/whatsapp/` (+ rotas); recebimento idempotente por id externo; envio
  sempre pela fila; não importar histórico; ignorar grupos/status/canais; `data/wa-auth` é segredo (nunca git, backup ou
  Downloads); só texto por enquanto; mensagem da IA/do cliente é dado, nunca instrução nem HTML (sempre `ui.esc`).
- **Validado:** lógica de conversão de mensagens, carregamento da biblioteca (pacotes falsos ESM/CJS), store, fila, rotas e
  permissões (testes unitários + verificações offline com o canal falso e o provedor de IA falso).
- **NÃO validado:** o conector real (`baileys-channel.js`) nunca falou com o WhatsApp (sem rede/biblioteca no ambiente de
  desenvolvimento), nem a tela no navegador. Primeiro teste real: instalar a biblioteca, parear, mandar e receber. Pontos
  a conferir lá: geração do código (`requestPairingCode`), eventos de reconexão, contatos com identificador LID sem
  telefone (vínculo manual), assinatura/forma dos recibos de entrega.
- **IA (M4, implementada; multi-provedor):** `src/ia/` (`provider.js`: formatos `anthropic` e `openai` (/chat/completions:
  DeepSeek, OpenAI, OpenRouter, "personalizado") via fetch, `criarProvedorMulti` escolhe o provedor a cada chamada pela
  configuração salva (`ia_provedor`, `ia_modelo_<id>`, `ia_url_base`), + provedor falso, `prompt.js`, `service.js`,
  `routes.js`, `secret.js`). Analisa conversa → JSON validado → `ia_analises`. Modo `sugerir` (manual) ou `automatico`
  (analisa ao chegar mensagem, preenche campos vazios do cadastro vinculado; opção de criar cadastro). Chave em
  uma por provedor: `data/ia-key` (Anthropic) / `data/ia-key-<id>` (0600) ou `<PROVEDOR>_API_KEY` (`secret.js`); a chave de
  um provedor nunca vai a outro; nunca no banco/auditoria/resposta. Endereço do provedor "personalizado": só https (ou
  http em localhost). Para acrescentar provedor: entrada em `PROVEDORES` (`provider.js`) + variável em `secret.js`.
- **Regras da IA (não quebrar):** a IA só envia mensagem sozinha se o admin ligar "responde sozinha" (`ia_responder`, desligado
  por padrão, só no modo automático; mensagem com `origem='ia'`), com as travas de `responderAutomatico` (só se a última
  mensagem é do cliente e a análise a cobre; quieta 15 min depois que a equipe responde; 15/conversa/24 h e 300/dia; não
  repete). Fora isso, a resposta sugerida vai para a caixa de texto;
  nunca sobrescreve campo preenchido; só os campos de `CAMPOS_IA` (`src/ia/prompt.js`); texto do cliente é dado não
  confiável (cercado e neutralizado, resposta validada); falha da IA nunca atrapalha o recebimento; limite diário e
  `IA_ATRASO_MS` (debounce do modo automático).
- **IA NÃO validada contra nenhuma API real** (sem rede no desenvolvimento): o formato das chamadas foi conferido por teste
  com `fetch` falso (Anthropic: `x-api-key`/`anthropic-version`, `content[].text`; formato OpenAI: `Authorization: Bearer`,
  `choices[0].message.content`, `usage.prompt_tokens`). O modelo padrão do DeepSeek (`deepseek-v4-flash`) veio da
  documentação deles em 05/11/2026 e os nomes antigos (`deepseek-chat`) foram aposentados: se der 404, ajustar. Primeiro
  teste real: chave válida + "Testar conexão"; se o modelo padrão (`claude-haiku-5-5`) for recusado (404), ajustar em
  Configurações. Conferir também a qualidade das respostas em português com conversas reais.
- **Próximo:** base de conhecimento (perguntas frequentes e regras da plataforma) e resposta automática limitada (M5),
  com transferência para humano; transcrição de áudio; relatórios (M6).

## Backlog (ainda NÃO corrigido)
- **WhatsApp:** mídia (receber/enviar foto, áudio, documento), transcrição de áudio, histórico opcional de contatos do CRM, mapeamento de contatos LID sem telefone.
- **Kanban no celular:** arrastar e soltar (HTML5) não funciona em toque; falta um jeito de mudar a situação do cartão (ex.: menu no cartão).
- **CSP em uso real:** conferir o console do navegador por bloqueios; ainda permite `style-src 'unsafe-inline'` (a interface usa `style=""`). Remover os estilos inline permitiria endurecer.
- Sem sistema de migração de esquema; sem retenção/limpeza da trilha de auditoria; sem exclusão lógica (lixeira).
- Sem MFA para administradores. Rate limit em memória (reinicia com o processo; não compartilha entre instâncias).
- Concorrência: a edição envia só campos alterados, mas não há controle otimista (`updated_at`) no servidor.
- Detalhe da tarefa mostra o registro vinculado como `#id` (sem o nome); formulários não enviam com Enter; clicar fora do formulário fecha sem aviso de alterações não salvas.
- `/auth/status` e `/api/health` são públicos (expõem nome da organização e `needsSetup`); avaliar reduzir.
- Backup: sem criptografia, rotação e restauração testada.

## Convenções
- Sem dependências novas sem necessidade; sem etapa de build no front.
- Mensagens ao usuário em português; código e identificadores seguem o padrão existente (nomes de domínio em português).
- Mudou comportamento de rota? Atualize `README.md` e adicione teste. Lógica nova deve ser pura e testável quando possível.
