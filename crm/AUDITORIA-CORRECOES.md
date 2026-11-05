# CRM Fortaleza Move — correções da revisão técnica

## Alterações realizadas

1. **Permissões no servidor:** as rotas de consulta/alteração de configurações, gerenciamento de usuários e auditoria agora exigem perfil `admin`. O bloqueio é aplicado na API, não apenas na interface.
2. **Proteção do último administrador:** o sistema impede desativar ou rebaixar o último administrador ativo. O campo de ativação também recebe validação estrita.
3. **Primeiro acesso concorrente:** a criação do administrador inicial agora usa transação SQLite imediata e comparação segura da chave, evitando duas inicializações simultâneas.
4. **Exportação CSV:** valores iniciados por caracteres que podem disparar fórmulas em planilhas são neutralizados; nome do arquivo exportado é sanitizado.
5. **Origem das requisições:** operações de escrita da API rejeitam chamadas identificadas como cross-site e validam o cabeçalho Origin quando enviado.
6. **Cookies:** cookie malformado deixa de derrubar a leitura da requisição.
7. **Arquivos locais:** pasta de dados é criada com permissão restrita e o arquivo principal do SQLite recebe permissão restrita quando o sistema operacional permite.
8. **Scripts ausentes:** foram incluídos comandos para consultar a chave de instalação antes do setup, gerar código de recuperação de senha e criar backup consistente do SQLite.
9. **Dependências:** metadados do `package-lock.json` alinhados ao `package.json`; a versão travada do Express (4.22.3) atende à faixa declarada (`^4.21.2`).
10. **Documentação:** README atualizado com instalação por `npm ci`, comandos, testes, backup e controles de segurança.
11. **Testes:** incluído teste automatizado da neutralização CSV.

## Validações executadas neste pacote

- Verificação de sintaxe dos arquivos JavaScript do servidor, scripts e testes: aprovada.
- Verificação de sintaxe dos módulos JavaScript do navegador: aprovada usando modo ES Module.
- `node --test`: 1 teste aprovado, 0 falhas.
- Integridade do arquivo ZIP final: será verificada na geração do pacote.

## Validações ainda pendentes

A instalação das dependências com `npm ci` não terminou dentro do tempo disponível neste ambiente. Por isso, não foi possível executar uma inicialização real do servidor, testes HTTP integrados, operações reais no SQLite ou validar a compilação nativa de `better-sqlite3` neste ambiente.

Antes de produção, execute em uma máquina/servidor com acesso ao registro npm:

```bash
npm ci
npm test
npm start
```

Depois, faça uma homologação completa: criar primeiro administrador, entrar como gestor e confirmar que `/api/settings`, `/api/users` e `/api/audit` respondem 403; testar cadastro/edição/exclusão dos módulos; gerar e restaurar backup em uma cópia; validar instalação PWA via HTTPS.

## Observações de segurança e operação

- Não há credenciais ou dados reais de clientes incluídos neste pacote.
- A chave de instalação anteriormente compartilhada deve ser considerada exposta. Gere uma nova para uma instalação limpa e nunca reutilize a chave antiga.
- O backup gerado pelo comando `npm run backup` deve ser copiado para outro armazenamento protegido. Backup no mesmo disco não protege contra perda do servidor.
- As correções não configuram SMTP, domínio, HTTPS, hospedagem, notificações ou integração com os aplicativos operacionais.

---

# Segunda rodada — auditoria de segurança e funcionalidades (03/11/2026)

## Correções aplicadas

1. **Perfil ao criar usuário:** perfil ausente agora vira `gestor`; valor inválido é rejeitado (422). Antes, qualquer valor diferente de "gestor" criava um **administrador**.
2. **IP confiável:** auditoria e sessões usam `req.ip`. `X-Forwarded-For` só vale de proxy confiável, configurado por `TRUST_PROXY` (padrão `loopback`). `isSecure` e a checagem de Origin também deixaram de ler cabeçalhos diretamente. Novo `COOKIE_SECURE=true`.
3. **Service worker:** cache `fm-crm-v2`, rede primeiro (cache só offline), sem guardar respostas com erro. Arquivos estáticos `.js/.css/.html` revalidam a cada uso (antes: 1 h de cache + cache-first sem versão, o que mantinha usuários na versão antiga).
4. **Login e bloqueio:**
   - removido o trancamento da conta (permitia derrubar o admin só sabendo o e-mail; o contador também não zerava);
   - limites por IP, IP+e-mail e e-mail, sempre com a mesma resposta 429;
   - scrypt equalizado para e-mail inexistente;
   - `/auth/setup` e `/auth/reset` com limite de tentativas; no setup, a chave é conferida antes do scrypt.
5. **Permissões e auditoria:**
   - gestor não exclui registros de módulos com dados pessoais, nem cenários/simulações, não exporta CSV e não vê a atividade recente (tarefas ele continua excluindo);
   - exportações, logins inválidos, campos alterados e identificação do registro excluído passam a ser auditados;
   - exclusão e remoção do histórico agora ocorrem em uma transação;
   - `/meta` devolve `can` e a interface esconde os botões sem permissão.
6. **CSV:** números (inclusive negativos) saem como número; só texto é neutralizado (também TAB/CR). Telefones tipo `+55 (85) 9…` não recebem apóstrofo. O filtro de datas de campanhas agora é o mesmo da lista, do resumo e da exportação (`COALESCE(data_publicacao, data_planejada)`).

Extras de baixo risco feitos junto: `Cache-Control: no-store` em `/api`; `Object.hasOwn` nas rotas dinâmicas (`/api/constructor` deixou de dar 500); validação da comissão (0–100) e de tamanho ao criar cenário (`0` deixou de virar o padrão); `.gitignore`.

## Como foi validado

- `npm test`: 15 testes, 0 falhas (CSV, limitador, perfis, `TRUST_PROXY`, IP).
- `npm run test:offline`: 51 verificações, 0 falhas, executando o `routes.js` real sobre SQLite real, com roteador mínimo no lugar do Express e `node:sqlite` no lugar do `better-sqlite3`.
- Sintaxe de todo o servidor e dos módulos do navegador: aprovada.

## Ainda NÃO validado

Servidor real com Express e `better-sqlite3`, navegador (botões escondidos, PWA), HTTPS/proxy, `npm audit`, restauração de backup. Ver `CLAUDE.md` (pendências).

---

# Terceira rodada — auditoria aprofundada (leitura completa do front-end e releitura do backend)

## Defeitos encontrados e corrigidos

**Funcionais (afetavam o uso do dia a dia)**
1. **Configurações não abria para o gestor:** a tela pedia `/settings` e `/audit` (403 para gestor) e falhava inteira; o gestor não conseguia trocar a própria senha. Agora o gestor vê só "Alterar minha senha" e "Sessões ativas".
2. **Editar tarefa vinculada apagava o vínculo:** o valor salvo era ignorado no formulário e a lista trazia só os 50 registros mais recentes. Agora o vínculo é preservado (`/relations?include=`), trocar o módulo limpa o registro, o servidor valida existência e, ao excluir o registro, a tarefa é desvinculada (sem órfãs).
3. **Recuperação de senha não fechava:** o comando imprimia só um código e a tela só aceitava link. Agora o comando imprime link + código (`PUBLIC_URL`), a tela aceita o código colado, e o código sai da barra de endereço depois de lido.
4. **Simulação financeira registrava números diferentes dos da tela:** o servidor usa as premissas salvas; premissas alteradas e não salvas eram ignoradas. Agora são salvas junto com a simulação.
5. **Kanban de tarefas escondia tarefas novas:** buscava as 200 tarefas mais antigas de todas as situações. Agora uma consulta por coluna (mostra "N de M" quando há mais).
6. **Parceiro que saía de "confirmada" mantinha a confirmação** (`confirmado_em`); agora é limpa (edição e acompanhamento).
7. **Datas no fuso errado:** confirmações e simulações (UTC) caíam no dia/mês seguinte depois das 21h. Corrigido em dashboard, relatórios, exportação e telas (`America/Sao_Paulo`).
8. **Listas de acompanhamento e tarefas** agora abrem com o vencimento/acompanhamento mais próximo primeiro (antes, o mais distante).
9. **Telas lentas sobrescreviam as novas:** resposta atrasada de uma tela anterior ou de uma busca antiga podia aparecer por cima. Corrigido (container por navegação e controle de sequência na busca).
10. **Paginação:** excluir o último item da última página mostrava "Nenhum registro"; agora volta à última página existente.
11. **Edição concorrente:** o formulário enviava todos os campos e sobrescrevia alterações de outra pessoa; agora envia só o que mudou.
12. `PATCH /users/:id` podia gravar a ativação e depois recusar o perfil inválido; agora valida tudo e grava em transação.
13. Tarefas canceladas apareciam como atrasadas no calendário.

**Segurança e robustez**
14. **CSP** (sem scripts inline; removidos os `onclick`), **HSTS** em HTTPS, `X-Frame-Options: DENY`.
15. Troca de senha com limite de tentativas (por usuário); senha com no máximo 128 caracteres.
16. Busca com `%` e `_` agora é literal (antes eram curingas).
17. Tetos para números (cadastros, premissas e custos), tamanho máximo de textos (acompanhamento, custos, cenários, nome da organização).
18. Filtro `?responsavel=` deixou de causar erro 500; leitura de simulações não quebra com JSON inválido.
19. Gestor não vê mais o card "Sobre o sistema" (caminho do banco e detalhes técnicos).

## Como foi validado
- `npm test`: 16 testes, 0 falhas.
- `npm run test:offline`: 83 verificações, 0 falhas (inclui recuperação de senha de ponta a ponta com o script real, vínculo de tarefas, fuso, paginação, limites).
- Sintaxe de todo o servidor e dos módulos do navegador.

## Ainda NÃO validado
Tudo o que depende de navegador real: telas alteradas (Configurações do gestor, formulário de tarefa, kanban, recuperação de senha, simulação), CSP em uso (conferir o console do navegador por bloqueios), service worker, HTTPS/proxy. E o servidor com Express e `better-sqlite3` reais. Ver `CLAUDE.md`.
