# Render: mudança do CRM não reinicia o servidor do Fortaleza Move

Requisição de continuidade, item 5 (11/11/2026).

> **ADIADO (decisão do Evandro, 11/11/2026 23:19):** não aplicar este filtro agora e não criar serviços separados. O Render fica como servidor temporário de testes; a Hostinger será tratada depois. Guardado aqui para quando for a hora.

## O problema

O serviço `fortaleza-mov-backend` do Render está com **Auto-Deploy: On
Commit**: qualquer envio ao `main` publica o servidor de novo — inclusive os
envios que só mexem no CRM (`crm/`), nos aplicativos, nos documentos ou nos
relatórios do teste (`logs/`). Cada publicação reinicia o servidor (motorista
on-line perde a conexão por alguns segundos). Em 11/11 isso derrubou uma
execução do teste de ponta a ponta no meio.

## O que já foi feito (no repositório)

- A esteira **Publicar o servidor** (`deploy-servidor.yml`) só dispara quando
  muda o que entra na imagem do servidor:
  `apps/backend/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml` e `.npmrc` (os arquivos que o
  `apps/backend/Dockerfile` copia). Ela publica pelo gancho do Render
  (segredo `RENDER_DEPLOY_HOOK`) e espera ficar no ar.
- O teste de ponta a ponta não roda mais logo depois de publicar (roda de
  madrugada).

## O que falta (você, no Render, 2 minutos)

A ferramenta que eu uso para falar com o Render não muda essa configuração,
e a do Render só muda pelo painel. Passo a passo:

1. dashboard.render.com → serviço **fortaleza-mov-backend**.
2. **Settings** ("Configurações") → seção **Build & Deploy** ("Compilação e
   publicação").
3. Em **Build Filters** ("Filtros de compilação") → **Included Paths**
   ("Caminhos incluídos") → **Edit** ("Editar") e adicione, um por linha:
   - `apps/backend/**`
   - `packages/shared/**`
   - `package.json`
   - `pnpm-lock.yaml`
   - `pnpm-workspace.yaml`
   - `.npmrc`
4. **Save Changes** ("Salvar alterações").

Não desligue o Auto-Deploy: com o filtro, ele continua publicando sozinho
quando o servidor muda (e a esteira do GitHub é a segunda garantia).

## Como vou testar depois que você salvar

1. Um envio que muda **só documentação** → conferir na lista de publicações
   do Render que **nada** foi publicado.
2. Um envio que muda o servidor → conferir que **uma** publicação aconteceu
   e que `/api/health` mostra o commit novo.

Só considero concluído depois desses dois testes. Antes disso, o item fica
como pendente no `PENDENCIAS.md`.
