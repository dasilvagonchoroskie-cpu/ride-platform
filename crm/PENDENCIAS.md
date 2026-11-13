# Pendências — CRM Fortaleza Move

Atualizado em 13/11/2026 (horário de Brasília). Lista única do que falta. Ao concluir um item, marcar com [x]
e a data; ao surgir um novo, acrescentar na seção certa. Detalhes técnicos de cada item estão no arquivo-mestre
(`PROJETO-crm-fortaleza-move.md`) e no `CLAUDE.md`.

## 0. Publicação 2.1.0-rc.1 no Render (13/11/2026)

- [x] 13/11 Merge `etapa2 → main` nos dois repositórios, deploy manual, 7 migrações aplicadas, bucket privado `crm-documentos`,
      cópia do cofre antes (`cofre.copia_pre_publicacao`). Rotas sem login → 401; setup fechado. Registro: `docs/PUBLICACAO-RENDER-2026-11-13.md`.
- [ ] **Dono: cadastrar no Render `FM_DOCS_KEY`, `FM_DADOS_KEY` e `DOCS_SUPABASE_KEY`** (passo a passo no registro acima) e
      guardar as duas primeiras no cofre de senhas. Até lá, o arquivo digital fica desligado.
- [ ] Depois das chaves: abrir `/api/admin/saude` logado e conferir `prova: "ok"` (Claude confere o log).
- [ ] Dono: testes reais do `docs/ROTEIRO-TESTES-REAIS.md` (WhatsApp, áudio, documento fictício, IA, notificações). Nenhum feito ainda.
- [x] 13/11 2.1.0-rc.2 no ar (commit e1dc4d8): "Contato pessoal (sem IA)" para família/amigos; regras de conversa informal e
      pergunta inesperada; barreira que impede a IA de confirmar cadastro/aprovação ou prometer. 202/202 testes.
- [ ] Dono: marcar como "Contato pessoal (sem IA)" (Conversas → conversa → botão ou menu ⋯) as pessoas da família/amigos que já
      aparecem no CRM; depois testar com um número conhecido e um desconhecido (roteiro abaixo).
- [x] 13/11 2.1.0-rc.3 (teste real do dono com o número da mãe): novo atendimento sozinho após 12 h parada ou novo clique no
      site; encerramento automático; saudação de retorno + menu; abertura profissional de cada opção; "Recebemos…" só para mídia
      e uma vez por atendimento; falso positivo do filtro (opção 3 transferida à toa) corrigido. 207/207 testes.
- [ ] Dono: repetir o teste pelo site (sem precisar concluir no CRM) e escolher cada opção do menu; conferir os textos em
      Configurações → Modelos de Comunicação da IA (saudação de retorno e as 5 aberturas são editáveis).
- [x] 13/11 Avisos dentro do CRM: ao abrir ou voltar para o CRM, nada do que já foi notificado no celular aparece de novo na tela
      (antes acumulava e repetia em dobro); com o CRM aberto, no máximo 2 avisos por vez, um por conversa. Cache `fm-crm-v31`.
- [ ] Opcional: "Health Check Path" `/api/health` no painel do Render (a ferramenta do Claude não altera essa opção).

## 1. Depende do dono (testes e ações que só ele pode fazer)

- [ ] **Testar o app 2.0.107 no celular** (ícone novo + correção do erro "ManageDataLauncherActivity"): instalar por
      cima do 2.0.105/2.0.106 e confirmar que abre e que o ícone aparece certo.
- [ ] **Testar as notificações com o CRM fechado**: Dashboard → "Ativar agora" → Permitir; deixar o app sem
      restrição de bateria no POCO; fechar, bloquear a tela e receber mensagem. Conferir os 3 tipos (mensagem nova,
      IA respondeu, transferência) e se o toque abre a conversa certa. Avisar o Claude para conferir o log do servidor.
- [ ] **Conta no Resend** com fortalezamovegtba@gmail.com e enviar a chave (re_…) — liga o "Esqueci minha senha" por
      e-mail. Até lá, a recuperação é por código de recuperação ou pelo painel do servidor.
- [ ] **Informações oficiais por assunto** (Configurações → Modelos de Comunicação da IA): cadastro, passageiro,
      encomendas, Clube de Vantagens, outros; depois, o site oficial.
- [ ] Trocar a senha inicial do administrador e gerar os códigos de recuperação.
- [ ] Conferir em Configurações se a chave do Gemini está salva e o "Testar conexão" passa.
- [ ] Verificação em duas etapas no Render, Supabase e GitHub (quando tiver o próprio celular).
- [x] 12/11 Hospedagem definitiva decidida: VPS da Hostinger, antes do lançamento. Preparação pronta em `deploy/hostinger/`.
- [ ] **Contratar a VPS e o domínio** e marcar o dia da migração (guia `deploy/hostinger/README.md`). Nada foi contratado nem migrado.
- [ ] Gestão de frota: auditoria no chat próprio (inclui apagar o projeto Supabase vazio myfktvjbdczfxgppnbua).

## 2. Ordem de desenvolvimento de 11/11 (executar uma etapa por vez, com relatório)

- [x] Etapa 1 — notificações no Android: diagnóstico e correção no código (11/11). Falta o teste no aparelho (seção 1).
- [ ] Etapa 2 — arquivo administrativo digital: fichários de Motoristas, Entregadores/motoqueiros, Parceiros do Clube
      e Comércios; sem duplicar a pessoa que tem mais de uma função; dados e documentos guardados com segurança após
      deploys. **Análise feita em 11/11 (plano em módulos M0–M6 no arquivo-mestre). Aguardando: teste das
      notificações + autorização do dono + 5 decisões:** (1) diferença entre "Parceiro do Clube" e "Comércio parceiro";
      (2) guardar a foto/PDF original dos documentos (necessário para o PDF da Etapa 3); (3) onde guardar os arquivos até
      a Hostinger (proposta: Supabase Storage, cifrado); (4) gestor pode ver documentos?; (5) guardar CPF/CNPJ?
      Preparação autorizada em 11/11 (só no ramo `etapa2`, sem produção):
      - [x] M0 migrações versionadas + simulação em cópia + relatório de duplicados (11/11, testado com dados fictícios).
      - [x] M1 (parte do banco) pessoas, empresas, vínculos e CPF/CNPJ protegidos (11/11, testado com dados fictícios).
      - [x] M1 (telas) ficha central da pessoa, "adicionar função", aviso de telefone repetido e junção de duplicados
            (só admin) — 11/11, no ambiente de desenvolvimento com dados fictícios (testes automáticos + navegador).
      - [x] M2 entregadores e motociclistas (12/11, ramo etapa2, dados fictícios): módulo próprio com a mesma pessoa podendo ser
            motorista e entregador, situação independente, "Contratado" em verde, documentos, modalidade, dashboard, relatórios,
            WhatsApp. Limitação: a IA ainda não marca os documentos do entregador (só do motorista); marcar manualmente na ficha.
      - [x] Relatórios em PDF em todos os setores, com CSV complementar (12/11, ramo etapa2): ver README "Relatórios em PDF".
            Ainda sem PDF: Conversas, Pessoas, Empresas e ficha individual (Etapa 3); Dashboard (o "Relatório geral" cobre o período).
      - [x] M3 comércios parceiros que pedem entregas (12/11, ramo etapa2, dados fictícios): função independente do Parceiro do
            Clube, empresa central reaproveitada (sem duplicar), situações, histórico, "Ativo na plataforma" em verde, dashboard,
            relatórios (PDF só admin + CSV), WhatsApp, tarefas. Limitações: sem CNPJ/documentos (M4); telefone e WhatsApp são um
            campo só; a IA não cria comércio nem marca documentos; gestor não exporta PDF/CSV de comércios (confirmar com o dono).
      - [x] M4 documentos e armazenamento seguro (12/11, ramo etapa2, dados fictícios): arquivo digital por função, cifrado, versões,
            situações independentes, permissões admin/gestor, CPF/CNPJ cifrados, backup/restauração/verificação, relatório PDF/CSV.
            Limitações: adaptador Supabase só testado com servidor falso; sem antivírus; sem rotação da `FM_DOCS_KEY`; CPF/CNPJ
            "obrigatório" não existe (só desligado/opcional).
      - [ ] DECISÕES DO DONO (M4): (1) manter originais em todas as substituições; (2) armazenamento definitivo (pasta persistente
            da Hostinger ou Supabase Storage privado) e configuração; (3) quais documentos o gestor pode ver/baixar/conferir;
            (4) quais dados de CPF/CNPJ exigir e guardar em cada cadastro; (5) prazo de retenção de documentos e cadastros encerrados.
            Antes de qualquer uso real: gerar `FM_DOCS_KEY` e `FM_DADOS_KEY` (64 hex) e guardá-las fora do servidor e do repositório.
      - [ ] Próximo (aguardando avaliação do M4 e autorização do dono): etapa seguinte. Depois: IA/WhatsApp ligados à pessoa (hoje o
            cadastro criado pela IA ainda não ganha pessoa).
      - [x] Ficha central da EMPRESA (parceiro do Clube; comércio entra no M3) e preservação dos históricos antigos
            (ficha central mostra os históricos originais de cada ficha; testado que migração e junção não alteram
            nenhum) — 11/11, desenvolvimento, dados fictícios.
      - [ ] Política de retenção e descarte por tipo de dado (decisão da empresa; não usar prazo fixo sem avaliar).
      - [ ] **Migração dos dados reais e deploy da Etapa 2: só depois do teste das notificações + autorização.**
- [ ] Etapa 3 — PDF de cada fichário concluído (o gerador central de PDF já existe desde 12/11) (baixar, imprimir, WhatsApp, e-mail, compartilhar), só por decisão de
      usuário autorizado, com nova versão sem apagar o histórico.
- [ ] Etapa 4 — status reais e independentes para entregadores, parceiros e comércios (verde só para concluído).

### Revisão da exportação PDF/CSV nos Relatórios (12/11/2026, ramo `etapa2`)
- [x] 12/11 PDF + CSV em todos os blocos de Relatórios, Financeiro, listas e Documentos; datas em UTC-3; período em Documentos; resumo com
      Comércios/Documentos; "estimado" nos financeiros; nomes de arquivo com período; botões maiores no celular. 159/159 testes.
- [ ] **Dono:** testar no celular real (APK) baixar, abrir e compartilhar o PDF (a verificação feita foi em Chrome emulando celular).
- [ ] **Dono (decisão):** atendimentos continuam só para o administrador (têm nome e assunto de pessoas); liberar ao gestor só se ele decidir.
- Fora do escopo, só anotado: o filtro de período do cartão "Documentos" da tela de Relatórios considera TODOS os documentos no total e só
  os enviados no período no subtítulo (comportamento do M4, mantido); sem antivírus nos arquivos (M4); app 1.0.x sem Web Share.

### Auditoria geral (12/11/2026, ramo `etapa2`)
- [x] 12/11 IA do WhatsApp: causa encontrada no log de produção (provedor fora do ar, sem nova tentativa); novas tentativas, transferência
      para a equipe quando não dá, recuperação após reinício, estado real na tela e botão "Tentar de novo". Testes com provedor falso.
- [x] 12/11 Ícone antigo no carregamento (quadrado "FM") trocado pelo logotipo oficial; favicon.ico, selo de notificação, cache v25.
- [x] 12/11 Busca com a lupa sobre o texto; botões pequenos no celular; faixa da conversa cortada no celular.
- [x] 12/11 Proteção contra troca acidental da FM_DOCS_KEY; auditoria automática de todas as rotas (401/403/CSRF).
- [ ] **Dono:** cadastrar as informações oficiais da Central (Configurações > Modelos de Comunicação da IA: geral, cadastro, encomendas,
      clube). Sem elas a IA só apresenta os serviços do menu e passa para a equipe — não inventa.
- [x] 12/11 Decisão do dono: a IA continua só no Gemini, **sem segundo provedor** (sem Groq). Quando o Gemini falha, a conversa passa
      para a equipe (comportamento da auditoria). Futuro: contratar a API paga do Gemini e só trocar a chave em Configurações.
- [ ] **Dono:** testar no celular real: falha da IA vira "IA tentando de novo"/transferência; compartilhar e imprimir um PDF pelo Android;
      conferir o logotipo na abertura do app e do navegador depois da publicação.
- [ ] Gerar um APK novo a partir do etapa2 quando for publicar (o app-twa do etapa2 foi igualado ao main; nenhuma mudança de app nesta auditoria).
- Observação (fora do escopo, sem mudança): o WhatsApp de produção reconecta a cada ~50 min (log "Reconectando…"); funciona, mas vale
  acompanhar. `/auth/status` e `/api/health` continuam públicos (backlog).

### Requisição final de 12/11/2026 (ramo `etapa2`, NÃO está em produção)
- [x] 12/11 Fluxo de candidatos a motorista (9 etapas, decisão só do administrador com confirmação, nada automático).
- [x] 12/11 Perfil "Avaliador de cadastros" (lista fechada de rotas, sem acesso administrativo), parecer com histórico imutável.
- [x] 12/11 ~~Integração assinada app do motorista → CRM~~ RETIRADA no mesmo dia (decisão do dono: os dois cadastros são independentes).
      Documentos: todas as versões guardadas (decisão do dono).
- [x] 12/11 Informações oficiais da IA organizadas em 8 assuntos com situação "preenchido/falta" (nada inventado).
- [x] 12/11 Preparação da migração para a Hostinger (scripts + guia + `SNAPSHOT_MODO=copia`), sem executar nada. 175/175 testes.
- [ ] **Dono:** criar o usuário do avaliador (Configurações → Usuários → perfil "Avaliador de cadastros") quando for usar.
- [ ] **Dono:** escrever as informações oficiais dos 8 assuntos da IA (hoje vazias: a IA não inventa).
- [ ] **Configuração futura (na migração):** `FM_DOCS_KEY`, `FM_DADOS_KEY` geradas na VPS e guardadas no cofre
      de senhas; armazenamento dos documentos no disco da VPS; desligar o cron `crm-manter-acordado`; APK com o domínio novo.
- [ ] **Validação física:** testar o fluxo do avaliador e dos candidatos no celular real (verificado só em Chrome emulando celular).

### Correções do atendimento por IA e 7 documentos (12/11/2026 noite, ramo `etapa2`, NÃO está em produção)
- [x] 12/11 Confirmação rápida de recebimento enquanto a IA processa (uma por fala; não conta como resposta); espera de 15 s → 7 s.
- [x] 12/11 Áudio: novas tentativas na leitura, a IA espera a leitura, aviso honesto quando não dá para ouvir (2 seguidos → equipe).
- [x] 12/11 Conversa concluída + mensagem nova = novo atendimento (limites e "repetida" por atendimento; histórico mantido).
- [x] 12/11 IA ⇄ equipe repetível: assumir para a IA na hora (até no meio da redação); devolver responde a pendente; trocas auditadas.
- [x] 12/11 Origem "site" (e outras) registrada e separada da intenção: menu geral, sem documentos de motorista sem pedido.
- [x] 12/11 Candidato a motorista: 7 documentos obrigatórios independentes (com antecedentes e 3 fotos do veículo); completo só com os 7.
- [x] 12/11 Sem integração com o aplicativo do motorista (retirada); avaliação no CRM não aprova, não cria nem ativa nada na Central.
- [x] 12/11 192/192 testes (17 novos em `test/ia-atendimento.test.js`; provedor e canal FALSOS).
- [ ] **Validação real (dono, depois da publicação autorizada):** áudio de verdade no WhatsApp; tempo até a confirmação e até a resposta;
      concluir e escrever de novo 1 min depois; assumir pelo celular, devolver pelo botão e repetir; clicar no botão do site; mandar os 7
      itens pela conversa. Nada disso foi testado com WhatsApp e Gemini reais.
- [ ] **Dono (opcional):** revisar os textos dos 2 modelos novos (confirmação rápida e áudio não ouvido) em Modelos de Comunicação da IA.
- Observação: a cota grátis do Gemini continua sendo o maior risco de demora/falha (log de 12/11: vários "IA indisponível").

### Etapa final: arquivos do WhatsApp e versão candidata (13/11/2026, ramo `etapa2`, NÃO está em produção)
- [x] 13/11 Fotos/PDFs do WhatsApp guardados cifrados na ficha (ou na espera / pendentes de classificação); texto não conta mais.
- [x] 13/11 Botões do site: os 4 textos reconhecidos como origem "Site"; "Vim pelo site" → menu geral (testado com o texto real do site).
- [x] 13/11 Versão candidata 2.1.0-rc.1, `/api/admin/saude`, procedimento de publicação/rollback e roteiro de testes reais. 199/199 testes.
- [ ] **Dono — decidir o destino:** Render agora (precisa de bucket PRIVADO no Supabase Storage + chave de serviço) ou VPS Hostinger.
- [ ] **Dono — gerar e guardar** `FM_DOCS_KEY` e `FM_DADOS_KEY` (cofre de senhas) e autorizar a publicação (`docs/PUBLICACAO-ETAPA2.md`).
- [ ] **Dono — testes reais** (`docs/ROTEIRO-TESTES-REAIS.md`): WhatsApp, Gemini, áudio, troca IA/equipe, site, 7 documentos, PWA,
      PDF e notificação no celular. Nada disso foi testado com WhatsApp/Gemini reais nem em aparelho físico.
- [ ] Decisão pendente (LGPD): prazo de guarda dos arquivos do WhatsApp que nunca viraram documento (hoje: nada é apagado sozinho).

## 3. Riscos e avisos em aberto

- [ ] **Horas grátis do Render**: CRM e servidor da plataforma acordados 24 h na mesma conta. Estimativa: as 750 h
      acabam por volta de 20–22/11 e os dois ficam suspensos até 01/12 (dados seguros no cofre). Dono decidiu manter
      assim até a Hostinger. Acompanhar em Billing ("Cobrança") → Free Usage ("Uso gratuito").
- [ ] Notificações no PWA (pelo Chrome): os 3 tipos se diferenciam por vibração/silêncio, não por som próprio; som
      diferente por tipo com o app fechado só no app Android.
- [ ] WhatsApp por "Dispositivos conectados" (não oficial): risco de bloqueio do número; migração futura para a via
      oficial da Meta.
- [ ] Gemini grátis: o Google pode usar as conversas para melhorar os produtos (aviso na tela).

- [ ] **Arquivos dos documentos não são guardados hoje**: do WhatsApp o CRM guarda só o texto lido (com números
      mascarados); a foto/PDF original é descartada, e o link do WhatsApp expira. Resolver na Etapa 2 (módulo M5).
- [ ] **Crescimento do cofre**: cada retrato leva o banco inteiro (hoje 673 KB) e o histórico guarda até ~63 versões
      (hoje 34 versões = 17 MB; banco do Supabase 31 MB de 500 MB grátis). Documentos NUNCA podem entrar no retrato;
      acompanhar o tamanho até a mudança para a Hostinger.
- [ ] Render grátis sem disco persistente (conferido 11/11): os dados só sobrevivem pelo cofre (até ~30 s de perda) e,
      se o Supabase estiver fora do ar, o CRM não liga (proteção contra subir vazio).

## 4. Itens técnicos ainda não validados em uso real

- [ ] Transcrição de áudio e leitura de documentos com mensagens reais do WhatsApp (primeiros casos reais são o teste).
- [ ] Contatos do WhatsApp com identificador LID sem telefone (vínculo manual).
- [ ] Restauração de uma versão antiga do cofre (histórico existe; restauração nunca foi ensaiada).

## 5. Backlog (melhorias conhecidas, sem prazo)

- [ ] WhatsApp: enviar foto/áudio/documento pelo CRM; histórico opcional de contatos.
- [ ] Kanban no celular: arrastar não funciona no toque; falta menu no cartão para mudar a situação.
- [ ] CSP ainda permite estilos inline (`style-src 'unsafe-inline'`).
- [ ] Sem lixeira (exclusão lógica), sem migrações de esquema, sem limpeza da trilha de auditoria.
- [ ] Limite de tentativas em memória (zera ao reiniciar).
- [ ] Edição sem controle de conflito (duas pessoas editando o mesmo cadastro).
- [ ] Detalhe da tarefa mostra o vínculo como `#id`; formulários não enviam com Enter; fechar o formulário não avisa
      sobre alterações não salvas.
- [ ] `/auth/status` e `/api/health` públicos (nome da organização e se precisa de configuração inicial).
- [ ] Leitura local de documentos (sem enviar ao Google) — ideia para o futuro.
