# Ride Platform

Plataforma de transporte de passageiros sob demanda (estilo Uber): **app do passageiro**, **app do motorista** e **painel administrativo**, sobre um **backend unico** e um **banco unificado**.

**Modulo 1 (esta entrega): Backend core** — autenticacao, usuarios, motoristas, documentos e veiculos.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + TypeScript + NestJS 10 |
| Banco | PostgreSQL 16 + PostGIS 3.4 (Prisma ORM) |
| Cache/filas | Redis 7 (+ BullMQ nas fases seguintes) |
| Arquivos | S3 / MinIO / Cloudflare R2 (URLs pre-assinadas) |
| Mobile | React Native + Expo (fases F5/F6) |
| Admin | Next.js (fase F7) |
| Mapas | Google Maps Platform |
| Pagamentos | Asaas (Pix/cartao/split) + Stripe |

## Estrutura

```
ride-platform/
├── apps/
│   └── backend/              # API NestJS (esta entrega)
├── packages/
│   └── shared/               # tipos, enums e schemas Zod compartilhados
├── infra/
│   ├── docker-compose.yml    # PostGIS, Redis, MinIO, MailHog
│   └── postgis/init.sql      # extensoes do banco
├── docs/
└── Makefile
```

## Pre-requisitos

- Node.js >= 20.11
- pnpm 9 (`npm i -g pnpm@9`)
- Docker + Docker Compose

## Subindo o projeto

```bash
cp .env.example .env
cp .env.example apps/backend/.env

pnpm install
docker compose -f infra/docker-compose.yml up -d

# compila o pacote compartilhado
pnpm --filter @ride/shared build

# gera o client do Prisma, aplica migrations + ajustes PostGIS
pnpm --filter @ride/backend prisma:generate
pnpm --filter @ride/backend prisma:migrate -- --name init
pnpm --filter @ride/backend prisma:postinit
pnpm --filter @ride/backend prisma:seed

# sobe a API
pnpm --filter @ride/backend start:dev
```

Ou simplesmente: `make setup && make backend-dev`.

- API: http://localhost:3333/api
- Swagger: http://localhost:3333/docs
- MinIO Console: http://localhost:9001 (`ride` / `ride12345`)
- MailHog: http://localhost:8025
- Admin semeado: `admin@ride.local` / `Admin@123` (troque via `SEED_ADMIN_PASSWORD`)

> **Importante:** rode `prisma:postinit` **depois** de `prisma:migrate`. Ele cria os indices GIST (`driver_locations`, `surge_zones`), indices trigram, os triggers de `updated_at` e as views do painel (`vw_active_drivers`, `vw_daily_financials`).

## Endpoints do Modulo 1

### Autenticacao (`/api/auth`)

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/auth/otp/request` | Envia OTP por SMS ou e-mail |
| POST | `/auth/otp/verify` | Valida OTP e autentica (cria a conta se nao existir) |
| POST | `/auth/password/register` | Cadastro com telefone + senha |
| POST | `/auth/password/login` | Login com telefone/e-mail + senha |
| POST | `/auth/refresh` | Rotaciona o par de tokens |
| POST | `/auth/logout` | Revoga o refresh token / dispositivo |
| PATCH | `/auth/password` | Troca a senha |
| GET | `/auth/me` | Usuario autenticado |
| POST | `/auth/devices` | Registra dispositivo e token de push |

### Usuarios (`/api/users`)

`GET /users/me` · `PATCH /users/me` · CRUD de `users/me/addresses` · `PATCH /users/me/addresses/:id/default`

### Motorista (`/api/drivers`)

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/drivers/onboarding` | CPF + CNH; cria a carteira virtual |
| GET | `/drivers/me` | Perfil + progresso dos documentos |
| PATCH | `/drivers/me` | Atualiza CNH e chave Pix |
| PATCH | `/drivers/me/online` | Alterna Online/Offline (exige aprovacao) |
| POST | `/drivers/me/location` | Heartbeat de posicao (PostGIS) |

### Documentos (`/api/documents`)

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/documents/upload-url` | Passo 1: URL assinada para envio |
| POST | `/documents/confirm` | Passo 2: confirma o envio |
| GET | `/documents/me` | Meus documentos + progresso |
| GET | `/documents/me/required` | Checklist obrigatorio |
| DELETE | `/documents/:id` | Remove documento reprovado |

### Veiculos e categorias

`GET /vehicle-categories` (publico) · `GET|POST|PATCH|DELETE /vehicles` · `/vehicles/me`

### Admin (`/api/admin`)

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/admin/users` | Lista usuarios (filtros + paginacao) |
| PATCH | `/admin/users/:id/block` | Bloqueia/desbloqueia |
| GET | `/admin/drivers` | Fila de motoristas com progresso |
| GET | `/admin/drivers/active/map` | Motoristas online com posicao (mapa) |
| GET | `/admin/drivers/:id` | Detalhe + documentos com URL assinada |
| PATCH | `/admin/drivers/:id/review` | Aprova / reprova / suspende |
| GET | `/admin/documents` | Fila de documentos |
| PATCH | `/admin/documents/:id/review` | Aprova / reprova documento |
| GET/POST/PATCH | `/admin/vehicle-categories` | Gestao de categorias |
| PUT | `/admin/vehicle-categories/:id/fare` | Define a tarifa vigente |

## Fluxo de documentos (2 etapas)

1. `POST /documents/upload-url` → devolve `uploadUrl` assinada + `documentId`.
2. O app faz `PUT` do arquivo direto no storage com o header `Content-Type` informado.
3. `POST /documents/confirm` com o `documentId` → o backend verifica a existencia do objeto e marca como enviado.
4. O admin revisa em `PATCH /admin/documents/:id/review`.
5. Com todos os documentos obrigatorios aprovados, `PATCH /admin/drivers/:id/review { status: "APPROVED" }` libera o motorista para ficar online.

## Testes

```bash
pnpm --filter @ride/backend test        # unitarios
pnpm --filter @ride/backend test:e2e    # exige infra no ar + banco migrado e semeado
```

## Convencoes

- Dinheiro sempre em **centavos (inteiro)**. Nunca `float`.
- Contratos de API definidos em `@ride/shared` (Zod) e reutilizados pelos 3 clientes.
- Erros sempre no envelope `{ success: false, error: { code, message, details } }` com `code` estavel.
- Sucesso sempre em `{ success: true, data, timestamp }`.
- Rotas publicas marcadas com `@Public()`; acesso por perfil com `@Roles()`.
- `driver_locations.location` e `surge_zones.boundary` sao `geography` do PostGIS: **nao** aparecem no Prisma Client. Use `PrismaService.upsertDriverLocation()` / `findNearbyDrivers()` / `findSurgeMultiplier()` (SQL cru tipado).

## Roadmap

| Fase | Escopo |
|---|---|
| **F1 (esta)** | Backend core: auth, users, drivers, documents, vehicles |
| F2 | Pricing (tarifas + surge), Geo (rotas/ETA com cache), Rides (maquina de estados) |
| F3 | Tempo real (Socket.IO), matching com PostGIS + Redis GEO, ofertas com expiracao |
| F4 | Pagamentos (Asaas/Stripe), carteira, extrato e saque via Pix |
| **F5** | App do passageiro (React Native + Expo) — **entregue**, com APK via GitHub Actions |
| F6 | App do motorista (React Native + Expo) |
| F7 | Painel admin (Next.js) |
| F8 | Notificacoes push, avaliacoes, seguranca, testes E2E completos |
| F9 | Producao: deploy, CI/CD, backups, observabilidade |
