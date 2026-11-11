# Plano de migração: Render → VPS Hostinger KVM 2 (Requisição 1, item 9)

**Status: só plano. Nada executado.** A migração precisa da sua autorização
expressa. O Render continua ligado até o servidor novo passar em todos os
testes e você mandar desligar.

## 1. Como está hoje

| Peça | Onde | Observação |
|---|---|---|
| Servidor (NestJS) | Render, serviço `srv-dar17o17lnhs739lu4t0` (`fortaleza-mov-backend.onrender.com`) | publica sozinho a cada envio ao `main` |
| Banco PostgreSQL + PostGIS | Supabase, projeto `fortaleza-mov-eua` (EUA) | cópia diária cifrada (`copia-banco.yml`, 03:23) |
| Redis | variável `REDIS_*` | o servidor só testa a conexão; nada usa Redis hoje |
| Central na web | Render (site estático `srv-dbps3ugae00c73cgol70`) | continua no Render (grátis); não precisa migrar |
| Avisos (push) | Firebase | não muda |
| E-mail do código | Gmail (Apps Script) | não muda |
| Mapa/rota/busca | TomTom | não muda (só a chave, que fica nas variáveis) |
| Tarefas agendadas | dentro do servidor: 3 rotinas de 1 e 10 minutos (`@Interval`); no GitHub: `manter-acordado` (a cada 14 min), `copia-banco` (diária), `crm-cofre-ativo` | |

## 2. Decisão de arquitetura (sua)

- **M1 (recomendado para começar): só o servidor vai para a Hostinger; o
  banco continua no Supabase.** Menor risco: nenhum dado muda de lugar, a
  volta para o Render é só apontar o domínio de novo.
- **M2: servidor e banco na Hostinger.** Mais barato a longo prazo e o banco
  fica no Brasil (se a VPS for no Brasil), mas exige cópia/restauração do
  banco, PostGIS instalado, cópias diárias próprias e janela de manutenção.

Minha sugestão: **M1 agora**, M2 depois do lançamento, com calma.

## 3. Pré-requisitos (antes de mexer em qualquer coisa)

1. **Domínio próprio** com a API em `api.<domínio>` (hoje no Render). Sem
   isso, trocar de servidor obriga atualizar os apps na loja.
2. VPS KVM 2 contratada (você contrata; tem custo mensal), Ubuntu 24.04 LTS,
   de preferência data center no Brasil.
3. Acesso SSH por chave (sem senha), usuário sem ser `root`.

## 4. Montagem do servidor novo (sem afetar produção)

1. Atualizar o sistema; firewall (UFW) aberto só para 22 (SSH), 80 e 443;
   `fail2ban`; atualizações de segurança automáticas.
2. Docker + Docker Compose. O repositório já tem `infra/docker-compose.yml`
   (Postgres/PostGIS 16-3.4, Redis 7, MinIO) — para M1 usar só **Redis** e o
   **servidor**; para M2 também o Postgres/PostGIS.
3. Proxy com HTTPS automático (Caddy) na frente do servidor.
4. Servidor: imagem montada pelo GitHub a partir do `main` (mesmo código do
   Render), reiniciando sozinho se cair (`restart: unless-stopped`).
5. **Variáveis** (copiar do Render, só os valores ficam na VPS, nunca no
   repositório): `NODE_ENV`, `API_PREFIX`, `API_URL`, `CORS_ORIGINS`,
   `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`,
   `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`,
   `JWT_REFRESH_TTL`, `OTP_*` (inclui `OTP_DEBUG_RETURN` e `OTP_CHAVE_TESTE`),
   `S3_*`, `EMAIL_*`, `BREVO_API_KEY`/`SMTP_*` (se usados), `FCM_*`,
   `TOMTOM_API_KEY`, `TOMTOM_API_KEY_MAPA`, `GOOGLE_MAPS_*` (se usados),
   `PAYMENT_*`/`ASAAS_*` (se usados), `DEFAULT_COMMISSION_PERCENT`,
   `MIN_PAYOUT_CENTS`. **Os mesmos `JWT_*`**: assim ninguém precisa entrar de
   novo na troca.
6. Tarefas agendadas: as 3 rotinas internas vêm junto com o servidor (não
   precisa recriar). `manter-acordado` deixa de ser necessário na VPS
   (servidor não dorme): desligar só depois da troca. `copia-banco`
   continua (M1) ou passa a apontar para o banco novo (M2).
7. Registros (logs) com rotação, e aviso se o servidor cair (o
   `conferir-servidor.yml` do GitHub pode chamar `/health` da VPS).

## 5. Testes no servidor novo (antes de trocar)

1. `/health` responde "ok" (banco, Redis, push).
2. **Teste de ponta a ponta inteiro contra o endereço da VPS**
   (`API_URL` da esteira apontando para a VPS, `MUDAR_CONFIG=nao`).
3. APK de teste apontando para a VPS: entrar, pedir corrida, chamada no
   motorista com tela apagada, taxímetro, carteira.
4. Central (web e APK) apontando para a VPS.
5. PostGIS (M2): `SELECT postgis_full_version();` e as buscas de motorista
   perto.

## 6. Troca (janela curta, de madrugada)

1. Baixar o tempo de cache do DNS (TTL) para 5 min um dia antes.
2. Apontar `api.<domínio>` para a VPS.
3. Acompanhar 30 min: `/health`, registros, uma corrida de teste.
4. M2 apenas: antes do passo 2, parar escrita no Render, fazer a cópia final
   do Supabase, restaurar na VPS, conferir contagens de tabelas.

## 7. Volta (rollback)

- M1: apontar `api.<domínio>` de volta para o Render (o Render continuou
  ligado e com as mesmas variáveis). Tempo: o do cache do DNS (~5 min).
- M2: igual, mas dados gravados na VPS depois da troca precisam voltar para o
  Supabase (por isso a troca do M2 é só com janela e cópia final).

## 8. Desligar o Render

Só depois de **7 dias** sem problema na VPS **e** sua autorização: suspender
(não apagar) o serviço do Render por mais 30 dias; depois apagar.
