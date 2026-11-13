# CRM Fortaleza Move

Aplicação web PWA para administração, relacionamento, marketing, acompanhamento comercial e planejamento financeiro da plataforma de transporte Fortaleza Move.

## Requisitos
- Node.js 18.17+ (testado em Node 22)
- 200 MB de disco
- Não requer banco externo: usa SQLite em arquivo (`data/crm.db`)

## Instalação
```bash
npm ci
npm start
```
Acesse `http://localhost:3000`.

## Primeiro acesso administrativo
Não existe senha padrão nem credencial embutida no código.

1. Ao abrir o sistema sem usuários cadastrados, a tela **Configuração inicial** é exibida.
2. A chave de instalação fica no console do servidor e no arquivo `data/installation-key.txt`.
3. Informe a chave, nome, e-mail e uma senha com no mínimo 10 caracteres (letras e números).
4. Após a criação, a chave é apagada e a rota de configuração é bloqueada permanentemente.

Para recriar um administrador em uma instalação nova, remova `data/crm.db` (perde os dados) ou crie usuários pela tela **Configurações**.

## Recuperação de senha e verificação por e-mail
Com o envio de e-mail configurado (`RESEND_API_KEY` ou `BREVO_API_KEY`; o Render grátis bloqueia SMTP, por isso o envio
é por API HTTPS):
- **Esqueci minha senha** (tela de login) manda um link de uso único (30 min) para o e-mail cadastrado. A resposta é a
  mesma para e-mail inexistente; limite por IP e por e-mail. Usar o link derruba as sessões e esquece os aparelhos.
- **Verificação por e-mail em aparelho novo** (Configurações > Verificação em duas etapas): ativar exige a senha e um
  código que chega no e-mail (prova que o e-mail recebe). Depois, só aparelho não confirmado pede um código de 6 números
  (10 min, 5 tentativas, até 5 envios a cada 30 min). Confirmado, o aparelho fica lembrado por 180 dias
  (`APARELHO_CONFIAVEL_DIAS`; cookie HttpOnly `fm_disp`, só o hash no banco). "Esquecer os outros aparelhos" desfaz.
  O aplicativo autenticador (TOTP) continua opcional e, se ligado, tem prioridade sobre o e-mail.
- Sem acesso ao e-mail: um administrador desliga a verificação de outro usuário; para o próprio administrador,
  `FM_RESET_EMAIL` ao ligar gera o código de senha nova no log **e desliga a verificação em duas etapas da conta**.

Sem e-mail, gere um código de uso único (validade 30 minutos) no servidor:
```bash
npm run reset -- usuario@exemplo.com
```
O comando imprime um **link** e um **código** de uso único (30 minutos). Para o link sair com o endereço público correto, defina `PUBLIC_URL` (ex.: `https://crm.seudominio.com.br`).

## Variáveis de ambiente
| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `FM_DATA_DIR` | `./data` | Diretório do banco e da chave de instalação |
| `FM_DB_PATH` | `./data/crm.db` | Caminho do banco SQLite |
| `TRUST_PROXY` | `loopback` | Em quais proxies confiar para `X-Forwarded-For/Proto`. `loopback` = proxy na mesma máquina; `1` = um proxy à frente (ex.: Docker, balanceador); `false` = sem proxy (acesso direto). Valor errado faz o login registrar o IP do proxy ou o app bloquear gravações (Origin). |
| `PUBLIC_URL` | `http://localhost:PORT` | Endereço público usado nos links de recuperação (e-mail, `npm run reset`, `FM_RESET_EMAIL`) |
| `RESEND_API_KEY` / `BREVO_API_KEY` | — | Chave do serviço de e-mail (grátis). Resend sem domínio próprio só entrega no e-mail da conta Resend |
| `EMAIL_FROM` | `CRM Fortaleza Move <onboarding@resend.dev>` | Remetente (no Brevo, precisa ser um remetente verificado) |
| `APARELHO_CONFIAVEL_DIAS` | `180` | Por quantos dias um aparelho confirmado não pede código |
| `COOKIE_SECURE` | — | `true` força o atributo `Secure` no cookie de sessão (use em produção com HTTPS) |

## Comandos administrativos
```bash
npm run key                 # mostra a chave somente antes do primeiro cadastro
npm run reset -- email@dominio.com  # gera código temporário de recuperação
npm run backup              # cria cópia consistente em data/backups/
```
O backup também pode receber uma pasta de destino: `npm run backup -- /caminho/seguro`. Proteja a pasta de backups com permissões restritas e mantenha cópias fora do servidor.

## Armazenamento e backup
- Banco SQLite com WAL em `data/crm.db` (+ `crm.db-wal`).
- Backup consistente: pare o processo e copie a pasta `data/`, ou use `sqlite3 data/crm.db ".backup backup.db"`.
- Sessões, senhas (scrypt + salt individual), usuários, registros e trilha de auditoria ficam no mesmo banco.

## Hospedagem
Qualquer ambiente com Node.js 18+ e disco persistente:
```bash
npm ci --omit=dev
PORT=3000 HOST=0.0.0.0 node server.js
```
Recomendações:
- Use HTTPS. Com proxy confiável (`TRUST_PROXY`), o cookie de sessão passa a `Secure` via `X-Forwarded-Proto`; em produção defina também `COOKIE_SECURE=true`.
- Proxy em outra máquina/container: defina `TRUST_PROXY` (ex.: `1`). Sem isso o app enxerga `http` e bloqueia gravações por divergência de Origin.
- Monte `data/` em volume persistente.
- Faça backup diário do arquivo SQLite.
- PWA exige HTTPS (ou localhost) para instalação e service worker.
- Exemplo de proxy reverso (Nginx):
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
- Docker: qualquer imagem `node:22-slim`, `WORKDIR /app`, `npm ci --omit=dev`, `CMD ["node","server.js"]`, volume em `/app/data`.

## Testes
Execute `npm test` para rodar os testes automatizados incluídos (CSV, limitador de tentativas, perfis/permissões, IP).
`npm run test:offline` roda um harness que exercita as rotas reais sobre SQLite, útil só quando não dá para instalar as dependências; não substitui o teste com o servidor real. Antes de produção, valide também o fluxo completo em uma instalação de homologação com dados fictícios.

## Perfis e permissões
| Ação | Administrador | Gestor |
|---|---|---|
| Ver, cadastrar e editar registros, acompanhamentos, tarefas, premissas financeiras e simulações | sim | sim |
| Excluir registros (motoristas, passageiros, parceiros, atendimentos, campanhas) | sim | não |
| Excluir tarefas | sim | sim |
| Excluir cenários e simulações financeiras | sim | não |
| Exportar CSV (dados pessoais) | sim | não |
| Exportar PDF de listas de pessoas (motoristas, entregadores, passageiros, parceiros, atendimentos) | sim | não |
| Exportar PDF de tarefas, campanhas, relatório geral e planejamento financeiro | sim | sim |
| Usuários, dados da organização, trilha de auditoria e atividade recente | sim | não |
| Alterar a própria senha e ver/encerrar as próprias sessões (tela Configurações) | sim | sim |
| Ver e responder conversas de WhatsApp, vincular a cadastro, criar tarefa a partir da conversa | sim | sim |
| Ativar/parear/desconectar o WhatsApp, ignorar contato e excluir conversa | sim | não |
| Analisar conversa com a IA, usar a resposta sugerida, preencher/criar cadastro a partir da análise | sim | sim |
| Configurar a IA (chave, modo, limites, modelo) | sim | não |

Todas as regras são aplicadas no servidor (a interface apenas esconde os botões). Usuário criado sem perfil informado recebe o perfil **gestor**; perfil inválido é rejeitado.

## Estrutura
```
server.js              servidor Express + inicialização
src/schema.sql         esquema SQLite
src/db.js              conexão, configurações e cenários iniciais
src/defs.js            definição dos módulos e campos (fonte única)
src/auth.js            scrypt, sessões, chave de instalação, limites de tentativas
src/limiter.js         limitador de tentativas em memória (sem dependências)
src/policy.js          perfis, permissões de exclusão/exportação, TRUST_PROXY
src/entities.js        CRUD genérico, validação e histórico
src/routes.js          API: dashboard, financeiro, relatórios, usuários
public/                SPA (HTML/CSS/JS sem build) + PWA (manifest, service worker, ícones)
scripts/               chave inicial, recuperação de senha e backup SQLite
src/whatsapp/          canal do WhatsApp (store, serviço, rotas, conector Baileys, canal falso)
src/ia/                assistente de IA (provedores Anthropic/DeepSeek/OpenAI/OpenRouter/outro, prompt e validação, serviço, rotas, cofre das chaves)
test/                  testes automatizados (+ offline-harness/)
```

## Segurança implementada
- Senhas com `scrypt` (N=16384) e salt aleatório por usuário.
- Sessão em cookie `HttpOnly`, `SameSite=Lax`, expiração de 12 h, token armazenado apenas como hash SHA-256.
- Limite de tentativas de login por IP, por IP + e-mail e por e-mail (resposta 429 idêntica para e-mails existentes ou não). A conta **não** é trancada: ninguém consegue bloquear o administrador apenas sabendo o e-mail. O tempo de verificação é equalizado para e-mails inexistentes.
- Limite de tentativas na chave de instalação e no código de recuperação; a chave é conferida antes do cálculo da senha.
- O IP registrado vem do Express (`req.ip`) e só considera `X-Forwarded-For` de proxy confiável (`TRUST_PROXY`); o cabeçalho enviado pelo cliente é ignorado.
- Todas as rotas privadas `/api` exigem sessão. As rotas de usuários, configurações e auditoria exigem perfil de administrador validado no servidor.
- Requisições de escrita de origem externa são bloqueadas; exportações CSV (somente administrador) neutralizam texto que poderia ser interpretado como fórmula; números, inclusive negativos, continuam numéricos.
- A criação do primeiro administrador ocorre em transação exclusiva para impedir duas configurações simultâneas.
- O sistema preserva ao menos um administrador ativo.
- Trilha de auditoria: criação, edição (nomes dos campos alterados, sem copiar dados pessoais), exclusão (identifica o registro), exportações CSV, logins e **tentativas de login inválidas**.
- Respostas de `/api` enviam `Cache-Control: no-store`.
- Política de segurança de conteúdo (CSP) restringe scripts ao próprio site (sem scripts inline) e bloqueia incorporação em outros sites; HSTS é enviado quando a conexão é HTTPS.
- Datas de confirmações e simulações são tratadas no fuso de Fortaleza (UTC-3) em listas, relatórios e exportações.
- O service worker usa rede primeiro (o app atualiza a cada deploy) e nunca guarda respostas da API.
- Nenhuma chave secreta versionada; a chave de instalação é gerada no servidor.

## Limitações desta versão
- Sem envio automático de mensagens, cobranças ou integração com os aplicativos operacionais.
- Recuperação de senha exige acesso ao servidor (não há e-mail configurado).
- PDF e CSV são gerados pelo servidor (ver "Relatórios em PDF"). A tela "Relatórios" ainda tem "Imprimir tela" (impressão do navegador).
- Não há envio de notificações push.

## WhatsApp: conversas dentro do CRM
A tela **Conversas** é uma caixa de entrada do WhatsApp de suporte: recebe mensagens, responde, vincula o contato ao
cadastro (motorista, passageiro ou parceiro, automaticamente pelo telefone), cria tarefa a partir da conversa e mostra
entrega/leitura. Só texto por enquanto: mídia (foto, áudio, documento) aparece como `[imagem]`, `[áudio]` etc.

**Como ligar (uma vez):**
1. `bash scripts/instalar-whatsapp.sh` (ou `./crm.sh instalar-whatsapp`) baixa a biblioteca para `data/wa-lib`.
2. No CRM: **Configurações > WhatsApp de suporte**, informe o número e clique em **Gerar código de pareamento**.
3. No celular: WhatsApp > **Dispositivos conectados > Conectar dispositivo > Conectar com número de telefone** e digite o código.

**Importante:**
- É um método **não oficial** (a conexão imita um aparelho extra). O WhatsApp pode limitar ou bloquear o número.
  A migração para a API oficial da Meta está prevista no `PLANO-IA-WHATSAPP.md`; o canal é um adaptador, então o resto do
  CRM não muda.
- O CRM **não importa o histórico antigo**, ignora grupos, status e canais, e só responde ao que o atendente enviar.
  Para um contato que não deve ficar no CRM, o administrador usa **Ignorar contato** (apaga a conversa e descarta o que vier).
- A pasta `data/wa-auth` guarda a sessão pareada: **quem a tiver controla o WhatsApp**. Nunca a copie, envie ou
  coloque em Downloads. O backup do CRM (`./crm.sh backup`) não a inclui. **Desconectar** apaga a sessão.
- Mensagens só são aceitas para envio com o WhatsApp conectado (evita uma mensagem velha sair horas depois). Falhas são
  repetidas até 3 vezes; depois aparece "Tentar de novo".
- Variáveis: `WA_CANAL=fake` (demonstração sem WhatsApp), `WA_DIGITANDO=0` (sem o "digitando…" antes de enviar),
  `WA_PAUSA_MS` (pausa entre envios seguidos).

## Ficha do motorista e cadastros fechados (verde)
- Cada motorista tem uma **ficha** (clique no nome): situação em destaque, documentos (CNH, CRLV e **comprovante de
  endereço**) com a data de chegada e o link para a mensagem, botão "Abrir conversa no WhatsApp", resumo da IA, dados e
  histórico. "Marcar conferido" em cada documento. A IA pede os três documentos no cadastro e, quando o comprovante
  chega, preenche o campo **Endereço**.
- O servidor marca cada documento como "Recebido — conferir" quando chega pelo WhatsApp (nunca desfaz "Conferido") e
  move a etapa: algum documento → "Cadastro em andamento"; os três → "Cadastro em análise" (e transfere para a equipe).
- **Fechados em verde:** motorista "Contratado", parceiro "Parceria confirmada" e passageiro "Usuário cadastrado". As
  listas abrem em **Em andamento** (sem os fechados nem os que não prosseguiram) e têm as abas "✅ Fechados" e "Todos"
  (`GET /api/<módulo>?etapa=andamento|fechados`).
- `POST /api/motoristas/:id/contratar` (`{ "confirmo": true }`, admin e gestor): passa para "Contratado", grava
  `contratado_em`, registra no histórico e na auditoria. `GET /api/motoristas/:id` devolve também `ficha`
  (conversa, documentos recebidos, último resumo da IA).

## Etapa 2 (em preparação, fora de produção)
- Migrações versionadas em `src/migracoes/` — só rodam com `FM_ETAPA2=1`. Para testar numa cópia sem mexer no
  original: `node scripts/simular-migracao.js caminho/crm.db` (mostra contagens antes/depois, se algum registro antigo
  mudou e os possíveis duplicados).
- `GET /api/admin/duplicados` e `GET /api/admin/migracoes` (só administrador; somente leitura).
- Com `FM_ETAPA2=1`: menu **Pessoas** (ficha central de cada pessoa com todas as funções, "Adicionar função", aviso de
  telefone já cadastrado ao criar motorista/passageiro e, só para o administrador, "Possíveis duplicados" com
  comparação e junção confirmada). Rotas em `/api/pessoas*`; sem a variável elas não existem.
- Também com `FM_ETAPA2=1`: menu **Empresas** (mesma ficha central para parceiros do Clube; rotas `/api/empresas*`). As
  fichas centrais mostram os históricos originais de cada função (acompanhamentos, tarefas, WhatsApp e, para o
  administrador, auditoria), sem copiar nem substituir nada.

## Relatórios em PDF (12/11/2026, ramo `etapa2`)
- PDF é o formato principal de exportação; o CSV continua como alternativa (só administrador). Gerador central **sem dependência
  nova** (`src/pdf/`: escritor de PDF próprio, A4, Helvetica, logotipo da Fortaleza Move, rodapé "Página X de N") e modelos por setor
  em `src/relatorios-pdf.js`.
- `GET /api/reports/pdf?type=<motoristas|entregadores|passageiros|parceiros|atendimentos|campanhas|tarefas|resumo|financeiro|cenario>`
  com os MESMOS filtros da lista (`q`, `f_<campo>`, `etapa`, `de`, `ate`; `id` para `cenario`). Cabeçalho `X-Linhas` = nº de registros
  (só nas listas). Sem registros o PDF sai assim mesmo, dizendo "Nenhum registro encontrado para os filtros aplicados." Máx. 5.000 linhas.
- CSV: `GET /api/reports/export?type=…` (por período) ou `&modo=lista` (filtros da lista; sem período, todo o histórico).
- Permissões (decididas no servidor; `meta.can.exportar_pdf` só orienta os botões): administrador exporta tudo; gestor só tarefas,
  campanhas, resumo, financeiro e cenário (listas de pessoas têm dados pessoais: LGPD). Toda exportação é auditada ("Exportação PDF/CSV"),
  sem gravar dados pessoais.
- Tela: botão **Exportar** nas listas, em Relatórios (por cartão e "Relatório geral (PDF)") e em Financeiro. Abre uma janela com
  **Baixar PDF**, **Abrir para imprimir** (nova aba, por causa da CSP), **Compartilhar** (Web Share, quando o aparelho permite) e, para o
  administrador, **Baixar CSV**.

### Auditoria geral de 12/11/2026 (ramo `etapa2`)
- **IA do WhatsApp — falha real de 12/11 (12:27):** o provedor de IA (Gemini) respondeu "indisponível"; o CRM só registrava no log e a
  conversa ficava "IA atendendo" sem resposta. Agora cada mensagem do cliente é acompanhada até a resposta ou a falha (`wa_conversas.ia_estado`):
  erro passageiro → novas tentativas (`IA_REPETIR_MS`, padrão 30 s, 2 min, 5 min); esgotou, erro definitivo (chave recusada, sem saldo) ou a IA
  não pode responder (limites, filtro de segurança) → transfere para a equipe com o modelo de transferência e o motivo "A IA não conseguiu
  responder" (notificação urgente). Varredura a cada 60 s (`IA_VARREDURA_MS`; `IA_VARREDURA=0` desliga) recupera mensagens que ficaram sem
  tratamento (reinício, temporizador perdido; até `IA_RECUPERAR_HORAS`=12 h). Mensagem nova durante o processamento não se perde. Rota
  `POST /api/wa/conversas/:id/ia/reprocessar` (admin e gestor, auditada). A tela mostra o estado real ("IA respondendo…", "IA tentando de
  novo", "IA não respondeu", "IA (resposta automática desligada)") e o botão "Tentar de novo".
- **Respostas da IA:** a redação recebe os serviços do menu oficial e as informações oficiais de TODOS os assuntos (o cliente pode perguntar
  do Clube no meio de um cadastro); continua proibido inventar preço, benefício ou regra; sem informação, encaminha para a equipe.
- **Identidade visual:** a tela de carregamento e a de erro de inicialização desenhavam um quadrado com "FM" (identidade antiga) — agora
  usam o logotipo oficial (`/icons/logo.png`). `favicon.svg` antigo removido; `/favicon.ico` gerado do ícone oficial; selo de notificação
  `badge-96.png` (silhueta do logotipo); metadados de compartilhamento; ícones revalidam no navegador (antes ficavam 1 dia em cache); cache v25.
- **Documentos:** impressão digital da `FM_DOCS_KEY` (`docs_chave_impressao`, nunca a chave) — chave trocada por engano bloqueia novos envios
  com aviso claro; troca planejada com `FM_DOCS_KEY_ANTERIOR`.
- **Interface:** lupa sobre o texto em todas as buscas (regra genérica de `input` vencia) corrigida; botões com área de toque ≥ 36 px no
  celular; faixa do atendimento quebra em duas linhas quando há alerta.
- **Segurança:** teste automático `test/rotas-permissoes.test.js` lê todas as rotas do código e confere no servidor real: sem login → 401;
  rotas de administrador → 403 para o gestor; mutação de outra origem → 403.

### Revisão dos Relatórios e exportação PDF/CSV em todos os blocos (12/11/2026, ramo `etapa2`)
- Auditoria: todos os pontos de exportação (listas de cada módulo, Relatórios, Financeiro, Documentos) já usam o mesmo componente
  (`public/js/exportar.js`) e o mesmo gerador (`src/relatorios-pdf.js`). Não existe mais ponto só-CSV. A tela de produção (`main`) ainda
  só tem CSV: o PDF só existe no ramo `etapa2`.
- Em Relatórios, cada cartão tem um botão **PDF / CSV** (administrador) ou **PDF** (gestor, nos blocos permitidos). O PDF sai com a lista do
  período e totais; o CSV, os mesmos registros. Tela, PDF e CSV usam o mesmo critério de data por módulo (campanhas: data de publicação ou,
  na falta, a planejada) e o fuso de Fortaleza.
- Corrigido: datas de simulações nos PDFs resumo/financeiro (usavam o dia em UTC; passam a usar o dia de Fortaleza); período do bloco
  Documentos passa a valer no PDF e no CSV (pela data de inclusão, UTC-3); resumo em PDF ganhou Comércios e Documentos; relatórios
  financeiros dizem "estimado/estimada" nos títulos de colunas (PDF e CSV); nomes de arquivo levam o período
  (`fortaleza-move_motoristas_2026-11-01_a_2026-11-30.pdf`, `motoristas_2026-11-01_a_2026-11-30.csv`).
- Testes: `test/relatorios-exportacao.test.js` (6 testes contra o servidor real: tela × PDF × CSV por módulo e período, vazio,
  financeiro/UTC-3, permissões por HTTP, relatório de 140 linhas em várias páginas, documentos por período).

## M3 — Comércios parceiros que pedem entregas (12/11/2026, ramo `etapa2`, só desenvolvimento)
- Módulo **Comércios** (só com `FM_ETAPA2=1`, migração 004, tabela `comercios`): loja que usa a plataforma para pedir entregas.
  É uma função **independente** do "Parceiro do Clube" (estabelecimento que dá desconto aos motoristas): a mesma empresa pode ter
  as duas, cada uma com a própria situação, e mudar uma nunca altera a outra.
- Titular é a **empresa central** (M1): ao cadastrar, o aviso de telefone repetido deixa escolher a empresa existente
  (`empresa_id`) em vez de criar outra; repetir a função na mesma empresa devolve 409. Razão social e endereço são copiados para a
  empresa quando ela ainda não os tem. Não há campo de CNPJ (documentos só no M4).
- Situações: Identificado → Primeiro contato → Aguardando resposta → Em negociação → Proposta apresentada → Cadastro em andamento →
  **Ativo na plataforma** (verde, "fechado") · Não concretizado. Acompanhamentos (histórico), tarefas, WhatsApp, busca e filtros
  funcionam como nos demais módulos. `POST /api/comercios/:id/ativar` (admin e gestor, `confirmo:true`) marca como ativo.
- Excluir encerra só o vínculo da função; a empresa, as outras funções e o histórico permanecem.
- Dashboard: cartões de comércios (total, novos, em negociação, ativos); Relatórios: cartão "Comércios parceiros (entregas)".
  PDF (`type=comercios`) e CSV só para administrador (dados pessoais; LGPD); gestor consulta e gerencia, sem auditoria e sem junção.
- A IA não cria comércios nem marca documentos; o vínculo da conversa com um comércio é manual.

## M4 — Documentos e armazenamento seguro (12/11/2026, ramo `etapa2`, só desenvolvimento, dados fictícios)
- **Arquivo digital por função** (só com `FM_ETAPA2=1`, migração 005): cada ficha de motorista, entregador, parceiro do Clube e comércio
  tem os seus documentos (`funcao` + `registro_id`). A mesma pessoa/empresa com várias funções tem documentos separados por função;
  nada é copiado. Categorias: pessoa (CNH, CRLV, comprovante de endereço, outro) e empresa (cartão CNPJ, contrato social, comprovante
  de endereço, alvará, documento do responsável, outro).
- **Situação de cada documento** (independente): Não enviado, Pendente de conferência, Conferido, Rejeitado, Necessita atualização.
  Conferir/rejeitar **nunca** contrata, ativa ou encerra a função: só muda o documento (e os campos antigos `doc_cnh/doc_crlv/doc_endereco`).
  A situação geral da ficha vem dos documentos exigidos (`docs_politica.obrigatorios`; motorista/entregador: CNH, CRLV e comprovante).
- **Versões:** enviar de novo cria versão nova (volta a "Pendente"); todas as versões ficam guardadas e acessíveis ao administrador.
  Nada é apagado sozinho. Exclusão definitiva só administrador, política ligada, `confirmo:true` e motivo; o histórico permanece.
- **Armazenamento (`src/documentos/`):** cada arquivo é cifrado antes de sair do servidor (AES-256-GCM, chave por arquivo embrulhada
  pela chave mestra `FM_DOCS_KEY`, 64 hex, **fora do repositório e do servidor de código**), com nome interno aleatório, em área privada
  (sem URL pública). Adaptadores: `local` (pasta `DOCS_DIR` ou `data/documentos`; recusa disco efêmero do Render/produção a menos que
  `FM_DOCS_LOCAL_PERSISTENTE=1`) e `supabase` (Storage privado, `DOCS_STORAGE=supabase`, `DOCS_SUPABASE_URL/KEY/BUCKET`). Os arquivos
  ficam **fora** do retrato cifrado do cofre; os metadados (com as chaves embrulhadas) ficam no banco.
- **Validação:** PDF/JPG/PNG/WEBP pelo conteúdo (assinatura), extensão coerente, tamanho até `DOCS_MAX_MB` (10), PDF com JavaScript/ação
  automática recusado, nome enviado só vira rótulo. Não há antivírus.
- **Acesso:** `GET /api/documentos/:id/arquivo` confere perfil, integridade (tamanho + SHA-256) e registra o acesso. Administrador
  vê/baixa/confere tudo; **gestor, por padrão, só anexa e vê a situação**. O administrador libera por tipo de documento (política).
  Tentativas negadas e falhas de integridade ficam no histórico do documento e na auditoria.
- **CPF/CNPJ:** só cifrados (`src/protegidos.js`, `FM_DADOS_KEY`), com finalidade; ficha mostra máscara; "mostrar número" é auditado;
  só administrador; coleta **desligada** até o dono decidir (`docs_politica.cpf_cnpj`).
- **Rotas:** `/documentos/meta|politica|lista`, `/documentos?funcao=&registro_id=`, `POST /documentos` e `/documentos/:id/versoes`
  (corpo bruto; metadados nos cabeçalhos `X-Documento`/`X-Nome-Arquivo`), `/documentos/:id[/arquivo|/conferir|/excluir-definitivo]`,
  `PUT /pessoas/:id/cpf`, `PUT /empresas/:id/cnpj` (+ `/remover`, `/revelar`). Relatório `type=documentos` (PDF e CSV, só admin,
  sem CPF/CNPJ nem conteúdo), cartões do dashboard e de Relatórios.
- **Manutenção:** `npm run docs:verificar` (abre cada versão, confere hash, acha órfãos), `docs:backup <pasta>` (arquivos cifrados +
  manifesto cifrado, incremental) e `docs:restaurar <pasta>` (só repõe o que falta, confere hash). Guarde o backup **e** a `FM_DOCS_KEY`
  em lugares separados: sem a chave os arquivos não abrem.
- Front: painel "Documentos (arquivo digital)" em cada ficha, menu **Documentos** (lista, filtros, política e decisões pendentes do dono).
  Cache do app `fm-crm-v23`. Testes: `test/m4-documentos.test.js`.

## Candidatos a motorista e avaliador (12/11/2026, ramo `etapa2`, só desenvolvimento)
- **Fluxo de candidatura** (migração 006, congelada): `candidaturas` com etapas Cadastro recebido → Documentação pendente/recebida
  (sozinha, pelos documentos) → Documentação em análise → Necessidade de complementação → Avaliação presencial pendente/realizada →
  Aprovado / Recusado. Independente da situação da ficha do motorista (aprovar **não** contrata nem libera no aplicativo).
  Decisão final **só do administrador**, com `confirmo:true` (recusa exige motivo); reabrir só admin, com motivo.
  Pareceres e eventos só acrescentam (gatilhos impedem alterar/apagar); correção = parecer novo que "substitui" o anterior.
- **Perfil `avaliador`** (ex.: o profissional que faz a avaliação presencial): lista FECHADA de rotas (`policy.ROTAS_AVALIADOR`):
  `GET /meta`, `GET /candidaturas`, `GET /candidaturas/:id`, `POST /candidaturas/:id/pareceres`, `GET /documentos/:id[/arquivo]`
  e a própria conta (`/auth/*`). Todo o resto: 403 no servidor. Vê nome, cidade, veículo, placa, categoria da CNH e documentos
  liberados na política (`docs_politica.avaliador`, padrão os 7 itens do candidato e outros), sem telefone nem anotações internas.
  Não aprova, não recusa, não exclui, não altera documento, não exporta. Toda consulta e parecer são auditados (sem conteúdo pessoal).
  Parecer: conclusão, texto, pendências, verificação de antecedentes **feita por profissional autorizado fora do CRM** (só registra
  o resultado e a fonte; o CRM não faz consulta externa automática), observações.
- **Rotas:** `GET|POST /candidaturas`, `GET /candidaturas/:id`, `POST /candidaturas/:id/etapa` (admin/gestor),
  `POST /candidaturas/:id/decisao` e `/reabrir` (admin), `POST /candidaturas/:id/pareceres` (admin/avaliador).
- **Sem integração com o aplicativo do motorista** (decisão do dono, 12/11 noite): o cadastro pelo app continua indo para a Central
  (aprovação lá); o CRM é um caminho independente (ficha + documentos + avaliação) que o dono usa para preencher o cadastro na Central.
- **Documentação obrigatória do candidato a motorista (7 itens independentes):** CNH; documento do veículo (CRLV ou equivalente);
  comprovante de residência; certidão de antecedentes criminais; foto do veículo de frente; de lado; de traseira. Cada um tem o seu
  espaço de envio no arquivo digital e o seu campo na ficha (`doc_*`); "completo" só com os 7 (a política não deixa retirar nenhum).
- Front: menu **Candidatos** (`public/js/views/candidatos.js`), botão "Avaliação do candidato" na ficha. Cache `fm-crm-v27`.
  Testes: `test/candidaturas.test.js` + avaliador em `test/rotas-permissoes.test.js`.
- **Informações oficiais da IA**: 8 assuntos (gerais, cadastro de motoristas, entregadores, encomendas, Clube, comerciantes,
  passageiros, outros) com "preenchido / falta preencher" na tela. Nada é preenchido sozinho.

## Atendimento por IA no WhatsApp: correções de 12/11/2026 noite (ramo `etapa2`, só desenvolvimento)
- **Confirmação rápida:** se a resposta não sair em `IA_CONFIRMACAO_MS` (padrão 6 s), vai UMA confirmação por fala do cliente (modelo
  "Confirmação rápida de recebimento", editável/desligável). É `tipo='aviso'`: não conta como resposta, não notifica, não muda a lista.
  Espera para juntar mensagens seguidas (`IA_ATRASO_MS`) caiu de 15 s para 7 s. O registro do servidor mostra o tempo de cada resposta.
- **Áudio:** leitura com novas tentativas curtas (`IA_MIDIA_REPETIR_MS`, padrão 3 s e 8 s); a IA espera a leitura terminar; áudio que
  não pôde ser ouvido recebe o modelo "Áudio que não pôde ser ouvido" (pede para escrever) sem chamar a IA; dois seguidos → equipe.
- **Novo atendimento depois do encerramento:** mensagem nova numa conversa concluída abre NOVO atendimento (`atend_inicio`): assunto,
  estado da IA, limites e "repetida" contam só a partir daí; o histórico continua. Limites: 40 respostas/60 análises por atendimento,
  80/120 por conversa em 24 h (`IA_RESPOSTAS_ATENDIMENTO`, `IA_ANALISES_ATENDIMENTO`, `IA_RESPOSTAS_CONVERSA_DIA`, `IA_ANALISES_CONVERSA_DIA`).
- **IA ⇄ equipe:** assumir/concluir cancela tentativas e confirmações pendentes; a IA confere o estado de novo antes de enviar (não fala
  se a equipe assumiu durante a redação); devolver faz a IA responder a mensagem pendente; trocas feitas pelo sistema são auditadas.
- **Origem ≠ intenção:** "Vim pelo site" (e Instagram, Facebook, TikTok, indicação) é guardado em `wa_conversas.origem_contato` e NÃO
  vira assunto nem perfil: a pessoa recebe o menu geral. O fluxo de cadastro só começa quando ela escolhe ou diz o que quer.
- Testes: `test/ia-atendimento.test.js` (provedor e canal FALSOS: não comprovam WhatsApp/Gemini reais).

## Arquivos do WhatsApp na ficha e versão candidata 2.1.0-rc.1 (13/11/2026, ramo `etapa2`, só desenvolvimento)
- **Fotos e PDFs do cliente** (`src/documentos/recebidos.js`, migração 007 `wa_anexos`): baixados pelo conector, validados pelas
  mesmas regras do envio pela tela, **cifrados** (mesma `FM_DOCS_KEY`, nome interno aleatório, nunca em pasta pública). Leitura disse
  com segurança qual dos 7 itens é → vai para a ficha (ou espera cifrado até a conversa ter ficha). Sem certeza → **pendente de
  classificação** (a equipe escolhe em Documentos → "Arquivos recebidos pelo WhatsApp"). Mesmo arquivo de novo → "repetido". Formato
  não aceito → recusado (nada guardado; a equipe vê; o cliente é convidado a reenviar). Falha → registrada e a conversa vai para a equipe.
- **Só conta o que tem arquivo:** campos `doc_*` da ficha mudam só pelo arquivo digital; com ele ligado, `PATCH` manual desses campos
  devolve 422. A IA não marca documento por texto; sem arquivo digital ligado, documento vira transferência para a equipe.
- Rotas: `GET /wa/anexos`, `POST /wa/anexos/:id/classificar`, `POST /wa/anexos/:id/resolver` (quem pode anexar documentos);
  `GET /wa/anexos/:id/arquivo` (só admin, auditado). `GET /admin/saude` (admin): versão, banco, migrações e prova real de gravar/ler
  um arquivo cifrado. Origem "Site" reconhece os 4 botões do site público.
- Versão `2.1.0-rc.1`, cache `fm-crm-v28`. Publicação: `docs/PUBLICACAO-ETAPA2.md`. Testes reais: `docs/ROTEIRO-TESTES-REAIS.md`.
  Testes: `test/wa-anexos.test.js` (rotas, banco, disco e cifra reais; WhatsApp e Gemini simulados).

## Hospedagem definitiva: VPS da Hostinger (preparado, NÃO executado)
Guia simples e scripts em `deploy/hostinger/` (provisionamento, systemd endurecido, Nginx + HTTPS, firewall, cópia diária cifrada,
teste de restauração, verificação de saúde, migração controlada e volta atrás). `SNAPSHOT_MODO=copia`: com banco no disco, o CRM usa
o disco como fonte e manda só cópias cifradas ao cofre; sem banco (dia da migração), traz o retrato uma vez.

## Dashboard, notificações e planejamento (11/11/2026)
- Indicadores de motoristas por etapa, sem somar duas vezes: interessados (só "Novo interessado"), em processo, aprovados
  (aprovados + contratados, com o detalhe) e contratados. Documento pendente não muda a etapa (aparece à parte).
  `GET /api/dashboard` não traz mais `financeiro`: a simulação fica só em Planejamento financeiro.
- Push com prioridade alta em todos os tipos (com prioridade normal/baixa o Android segurava o aviso com a tela bloqueada);
  com o CRM na tela, o service worker não mostra notificação do sistema (o próprio CRM avisa, sem duplicar); inscrições que
  falham 8 vezes seguidas ou respondem 404/410 saem; a inscrição é refeita se a chave do servidor mudar. Log por envio
  (só o tipo e contagens).
- Planejamento financeiro: receita, custos e resultado separados e marcados como projeção; sem custos informados, a tela
  diz "Simulação incompleta" e não mostra resultado nem margem.

## E-mail de acesso e "Esqueci minha senha"
- Tela de login: botão "Esqueci minha senha" (link por e-mail). Sem envio de e-mail ligado no servidor, a tela explica
  os outros caminhos (código de recuperação, administrador redefine a senha do gestor, código pelo painel do servidor).
  `GET /api/auth/status` devolve `recuperacao_email` (true/false).
- Admin troca o e-mail de acesso de qualquer usuário: Configurações → Usuários → lápis (`PATCH /api/users/:id` com
  `email`; validado, sem repetir; as sessões do outro usuário caem).
- Sem conseguir entrar: variável `FM_TROCAR_EMAIL="antigo@x.com>novo@y.com"` no servidor (start.js), reiniciar e apagar.

## Notificações no Android
- O app 2.0+ é uma Trusted Web Activity: abre o CRM pelo Chrome do celular e as notificações chegam como notificações do
  app (canais com som próprio). A permissão de notificação é do app no Android e é pedida ao tocar em "Ativar notificações".
- O app 1.x (navegador embutido) não recebe push. Para trocar: **desinstalar o 1.x** e instalar o 2.x (assinaturas diferentes).
- A inscrição é renovada ao abrir o CRM e quando o serviço de push a troca (`POST /api/push/inscrever` com `renovar: true`
  mantém os tipos escolhidos). Configurações → Notificações mostra uma linha de diagnóstico (ambiente, permissão, inscrição).

## Central de Atendimento Inteligente
Com a IA no modo automático e "responde sozinha" ligado, o WhatsApp vira uma central: saudação e menu no primeiro contato
(1 Cadastro de motorista e veículo, 2 Passageiro, 3 Encomendas, 4 Clube de Vantagens, 5 Outros), atendimento por assunto
(o cliente pode digitar o número ou só explicar), confirmação de documentos, e **transferência para a equipe** quando o
cliente pede um atendente, há reclamação, aprovação, valores ou falta informação oficial. Estados: IA atendendo,
Aguardando atendimento humano (com motivo), Atendimento humano e Concluído — filtro na tela Conversas e botões
Assumir / Devolver à IA / Concluir (com mensagem de encerramento). Quem responde pelo CRM ou celular assume a conversa
e a IA para. Os textos fixos e as informações oficiais por assunto ficam em Configurações > Modelos de Comunicação da IA
(só administrador edita). API: `POST /api/wa/conversas/:id/atendimento` (`acao`: assumir | devolver | concluir,
`enviar_encerramento`), `GET|PUT /api/ia/modelos`.

## Inteligência (IA) nas conversas
O assistente lê a conversa e devolve: **resumo, assunto, urgência, sentimento, dados do contato, resposta sugerida,
próxima ação e tarefa sugerida**. Aparece no topo de cada conversa (botão **Analisar com IA**).

**Ativar (administrador):** Configurações > **Inteligência (IA)**: escolha o **provedor**, cole a chave dele, confira o
modelo, escolha o modo e marque "IA ativada". Use **Testar conexão**. Provedores: Anthropic (Claude), **DeepSeek**
(padrão `deepseek-v4-flash`), OpenAI, OpenRouter e **Outro (formato OpenAI)**, que aceita qualquer serviço com
`POST {endereço}/chat/completions` (informe o endereço `https://...` e o modelo). Trocar de provedor vale na hora, sem
reiniciar. Cada provedor tem a própria chave e o próprio modelo (OpenAI, OpenRouter e Outro não têm modelo padrão:
informe). As chaves ficam em `data/ia-key` (Anthropic) e `data/ia-key-<provedor>` (permissão 0600), nunca no banco,
nunca voltam para a tela (só os 4 últimos caracteres) e não entram no backup. Também aceitam variáveis de ambiente:
`ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `IA_API_KEY` (Outro). A chave de um
provedor nunca é enviada a outro. Saldo: DeepSeek, OpenAI e Anthropic cobram por uso pré-pago; sem saldo o teste
avisa "conta sem saldo".

**Modos:**
- **Sugerir** (padrão): só analisa quando o atendente clica.
- **Automático:** analisa cada conversa quando chega mensagem (espera ~15 s para a pessoa terminar de escrever) e
  **preenche os campos vazios** do cadastro vinculado. Com a opção "criar cadastro" ligada, também cria o cadastro de
  motorista/passageiro/parceiro quando a IA identifica o perfil **e** há dados suficientes (cidade, nome etc.).

**O que a IA faz e não faz:**
- **Nunca envia mensagem sozinha.** A resposta sugerida vai para a caixa de texto e só sai quando o atendente envia.
- **Nunca sobrescreve** um campo que já tem valor; só preenche os vazios. Só mexe em campos permitidos (nome, cidade,
  próxima ação, observações; e, em parceiros, estabelecimento, categoria, responsável e benefício). Não muda situação,
  datas nem telefone. Valores inválidos para o campo são descartados. Tudo fica na auditoria como "Assistente IA".
- O texto das conversas é tratado como **não confiável**: fica cercado no prompt, instruções escondidas nele são
  ignoradas, e a resposta da IA passa por validação rígida (listas fechadas, tamanhos, campos permitidos).
- Limite de análises por dia (padrão 150) e contagem de tokens no cartão de configuração. Falha da IA não atrapalha o
  atendimento: a mensagem chega normalmente.

**Privacidade (LGPD):** o texto das conversas analisadas é enviado à API do provedor escolhido, que pode processar os
dados fora do Brasil. Informe isso no aviso de privacidade do atendimento. Modelos padrão: `claude-haiku-5-5`
(Anthropic) e `deepseek-v4-flash` (DeepSeek); ajustáveis em Configurações (os nomes dos modelos mudam: confira no
site do provedor).

## Hospedagem gratuita no Render (com cofre de dados)
O Render grátis apaga o disco a cada reinício. Por isso, em produção o CRM sobe com `node start.js` (Dockerfile):
ele restaura a pasta `data/` de um retrato **criptografado** guardado no Supabase e envia um retrato novo a cada 30 s
quando algo muda. Variáveis: `SNAPSHOT_URL`, `SNAPSHOT_ANON`, `SNAPSHOT_TOKEN`, `SNAPSHOT_KEY`, além de
`TRUST_PROXY=1`, `COOKIE_SECURE=true` e `PUBLIC_URL`. Se o cofre não responder, o CRM não sobe (para não começar vazio).
Chave de instalação sem acesso ao log: defina `FM_INSTALL_KEY` (12+ letras/números/hífen) antes do primeiro
administrador. Senha esquecida (sem terminal no Render): defina `FM_RESET_EMAIL=email`, reinicie, pegue o código no log e apague a variável.

## IA grátis
Configurações > Inteligência (IA) > provedor **Google Gemini (grátis)** ou **Groq (grátis)**. A chave sai de graça, sem
cartão: Gemini em aistudio.google.com/apikey, Groq em console.groq.com/keys. Dá para cadastrar os dois e usar um como
**reserva** (quando o principal estoura o limite grátis). Variáveis aceitas: `GEMINI_API_KEY`, `GROQ_API_KEY`.
