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

## Recuperação de senha
Não há envio de e-mail. Gere um código de uso único (validade 30 minutos) no servidor:
```bash
npm run reset -- usuario@exemplo.com
```
O comando imprime um **link** e um **código** de uso único (30 minutos). Abra o link, ou, na tela de login, use "Esqueci minha senha" > "Já tenho o código" e cole o código; depois escolha a nova senha. Para o link sair com o endereço público correto, defina `PUBLIC_URL` (ex.: `https://crm.seudominio.com.br`). O código não é enviado por e-mail e não deve ser compartilhado.

## Variáveis de ambiente
| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `FM_DATA_DIR` | `./data` | Diretório do banco e da chave de instalação |
| `FM_DB_PATH` | `./data/crm.db` | Caminho do banco SQLite |
| `TRUST_PROXY` | `loopback` | Em quais proxies confiar para `X-Forwarded-For/Proto`. `loopback` = proxy na mesma máquina; `1` = um proxy à frente (ex.: Docker, balanceador); `false` = sem proxy (acesso direto). Valor errado faz o login registrar o IP do proxy ou o app bloquear gravações (Origin). |
| `PUBLIC_URL` | `http://localhost:PORT` | Usado só pelo comando `npm run reset` para montar o link de recuperação |
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
- PDF é gerado pela impressão do navegador; CSV é exportado pelo servidor.
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
Senha esquecida (sem terminal no Render): defina `FM_RESET_EMAIL=email`, reinicie, pegue o código no log e apague a variável.

## IA grátis
Configurações > Inteligência (IA) > provedor **Google Gemini (grátis)** ou **Groq (grátis)**. A chave sai de graça, sem
cartão: Gemini em aistudio.google.com/apikey, Groq em console.groq.com/keys. Dá para cadastrar os dois e usar um como
**reserva** (quando o principal estoura o limite grátis). Variáveis aceitas: `GEMINI_API_KEY`, `GROQ_API_KEY`.
