# Publicação no Render — 2.1.0-rc.1 (13/11/2026)

Autorização formal do dono em 13/11/2026 06h33. O Render é provisório (cerca de 1 mês) até a VPS da Hostinger.

## A. Publicação
- URL privada: https://crm-fortaleza-move-ilv9.onrender.com (só com login; nenhuma conta nova foi criada).
- Serviço: `crm-fortaleza-move` (srv-dbp6u4utlv9c73en3b0g), conta "Evandro's workspace", Oregon, plano grátis, Docker
  (`crm/Dockerfile`, contexto `crm`), ramo `main`, auto-deploy DESLIGADO. Nenhum outro serviço foi tocado
  (`fortaleza-mov-backend` e o site não mudaram).
- Versão 2.1.0-rc.1, cache `fm-crm-v28`. Commit publicado: `88dd8c2` (monorepo `ride-platform`, main).
  Merge `etapa2 → main`: `5c2f29f` (monorepo) e `117b9f7` (backup `CRM-Fortaleza-move-`), sem force push, nenhum ramo apagado.
  O merge trouxe versões antigas de 5 logs automáticos fora de `crm/`; foram restaurados ao estado do main em `88dd8c2`.
- Deploy `dep-dbrdlp3bc2fs73cpkqhg`: live em 13/11 06h40 (Brasília). Retrato do cofre v3473 restaurado; migrações 1–7
  aplicadas (2 = 1 pessoa criada e 1 vínculo, nada unido); WhatsApp reconectou; novo retrato v3474 gravado.

## Cópias de segurança feitas antes
- `cofre.copia_pre_publicacao` (Supabase, sem acesso pela API pública): cópia integral do retrato v3472 (cifrado).
- `cofre.historico` até o id 73 (versões por hora/dia).
- Volta ao estado anterior: copiar `dados`/`versao` de `cofre.copia_pre_publicacao` para `cofre.snapshot`, tirar
  `FM_ETAPA2` do Render e publicar o commit `b73b921` (deploy manual). Detalhes em `PUBLICACAO-ETAPA2.md`.

## Variáveis colocadas no Render (sem segredos)
`FM_ETAPA2=1`, `DOCS_STORAGE=supabase`, `DOCS_SUPABASE_URL=https://jjrcfoxhzpaguskeywkf.supabase.co`,
`DOCS_SUPABASE_BUCKET=crm-documentos`, `COOKIE_SECURE=true`. As outras (cofre, WhatsApp, Gemini) não foram alteradas.

## Supabase Storage
- Bucket `crm-documentos` criado PRIVADO (público = não; limite 25 MB; só `application/octet-stream`, pois o CRM só
  envia arquivo já cifrado). `storage.objects` com RLS ligado e nenhuma política: só a chave secreta do servidor acessa.
- Conferido de fora: endereço público → "Bucket not found"; listagem com a chave publicável → lista vazia.

## Bloqueio: 3 segredos que só o dono cadastra (documentos digitais desligados até lá)
Sem eles o CRM funciona normalmente, mas o arquivo digital fica desligado: documentos que chegam pelo WhatsApp são
transferidos para a equipe ("documento_sem_arquivo") e nada é gravado. Nada foi inventado nem colocado no repositório.

| Variável | O que é | Como obter |
|---|---|---|
| `FM_DOCS_KEY` | chave que cifra os arquivos (64 caracteres 0-9/a-f) | gerar (abaixo) |
| `FM_DADOS_KEY` | chave que cifra CPF/CNPJ (64 caracteres 0-9/a-f), diferente da anterior | gerar (abaixo) |
| `DOCS_SUPABASE_KEY` | chave secreta do Supabase (`sb_secret_…`), só no servidor | painel do Supabase |

1. Gerar as duas chaves (cada uma separada): no Termux, `openssl rand -hex 32`; ou pedir ao Claude ("pode gerar"),
   que gera e mostra uma única vez no chat. Guardar as duas no cofre de senhas (perder `FM_DOCS_KEY` = perder os documentos).
2. Supabase → projeto `crm-fortaleza-move` → **Project Settings** (Configurações do projeto) → **API Keys** (Chaves de API) →
   **Secret keys** (Chaves secretas) → **Create new secret key** (Criar chave secreta), nome `crm-documentos` → copiar.
3. Render → `crm-fortaleza-move` → **Environment** (Ambiente) → **Add Environment Variable** (Adicionar variável) para
   cada uma das três → **Save, rebuild, and deploy** (Salvar, recompilar e publicar).
4. Logado como admin, abrir https://crm-fortaleza-move-ilv9.onrender.com/api/admin/saude e conferir
   `"documentos": { "pronto": true, "prova": "ok" }` (grava, lê e apaga um arquivo de prova cifrado).

## B. Segurança verificada no servidor publicado
- Sem login: `/api/motoristas`, `/api/admin/saude`, `/api/wa/anexos`, `/api/documentos`, `/api/candidaturas`, `/api/users`,
  `/api/settings`, `/api/reports/export`, `/api/reports/pdf`, `/api/pessoas`, `/api/ia/modelos` → 401.
- Cadastro público fechado: `POST /api/auth/setup` → 403 `setup_closed`. Só `/api/health` e `/api/auth/status` são públicos.
- Toda rota coberta por `test/rotas-permissoes.test.js` (login obrigatório; `requireAdmin` → 403 para gestor; avaliador só na lista).
- HTTPS do Render; cookie `Secure` forçado (`COOKIE_SECURE=true`); sessão expira por inatividade (60 min); limites de login por
  origem, sem trancar conta; `/api` com `no-store`; CSP sem script inline; documentos sem URL pública (só rota autenticada).

## D. Testes
- 199/199 testes automáticos (ramo etapa2, antes do merge); partida local em modo produção com `FM_ETAPA2=1`: 7 migrações,
  rotas 401 sem login, setup 422/403.
- No Render: health 200, 7 migrações, cofre gravando, WhatsApp conectado, `sw.js` = `fm-crm-v28`.
- NÃO verificado ainda: gravação/leitura cifrada no Supabase (depende dos 3 segredos), Gemini e WhatsApp com mensagem real,
  tela no navegador do dono. O "Health Check Path" do Render está vazio (pode ser `/api/health`; ajuste pelo painel, opcional).

## E. Testes pendentes do dono
Roteiro completo em `ROTEIRO-TESTES-REAIS.md`. Resumo: entrar no CRM pelo celular; cadastrar os 3 segredos e conferir
`/api/admin/saude`; mandar do outro celular uma mensagem, um áudio e a foto de um documento FICTÍCIO pelo WhatsApp;
conferir a resposta da IA, a ficha e "Arquivos recebidos pelo WhatsApp"; notificações com o app fechado.
Nenhum desses testes foi feito ainda.

## F. Migração futura para a Hostinger
Guia `deploy/hostinger/README.md`. Levar: o banco (do cofre), `wa-auth`, chaves da IA, as mesmas `FM_DOCS_KEY`/`FM_DADOS_KEY`
(sem elas os documentos não abrem) e os arquivos do bucket `crm-documentos` (ou manter o Supabase Storage).
