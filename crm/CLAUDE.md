# CLAUDE.md — CRM Fortaleza Move

CRM web (PWA) para a plataforma de transporte Fortaleza Move: motoristas, passageiros, parceiros, atendimento,
marketing (campanhas), tarefas e planejamento financeiro (cenários e simulações). Interface e mensagens em
**português do Brasil**. Fuso de referência: `America/Sao_Paulo` (Fortaleza, UTC-3, sem horário de verão).

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

## Hospedagem no Render grátis + cofre (05/11/2026)
- Render grátis tem disco temporário (apaga tudo a cada reinício/deploy/hibernação) e hiberna após 15 min sem acesso.
- Solução: `start.js` + `src/persist.js`. Ao ligar, restaura `data/` (banco, `wa-auth`, chaves da IA) de um retrato
  **cifrado (AES-256-GCM)** guardado no Supabase (projeto Supabase da conta Fortaleza Move, ref `xefeimjmvofeujcqlnuv`,
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
- **Regras da IA (não quebrar):** a IA nunca envia mensagem sozinha (resposta sugerida vai para a caixa de texto);
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
