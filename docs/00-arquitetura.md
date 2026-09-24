# Arquitetura — Modulo 1 (Backend core)

## Visao geral

```
App Passageiro ─┐
App Motorista  ─┼── HTTPS/REST ──> NestJS API ──> PostgreSQL + PostGIS
Painel Admin   ─┘                  (JWT + refresh)      │
                                        │                └── driver_locations (geography)
                                        ├── Redis (cache/geo/filas)
                                        ├── S3/MinIO (documentos, URL assinada)
                                        └── FCM / SMTP (notificacoes)
```

## Camadas do backend

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Config | `src/config` | Validacao de env com Zod, acesso tipado (`AppConfigService`) |
| Common | `src/common` | Guards, filtros, interceptors, pipes, erros, utils |
| Database | `src/database` | `PrismaService` (+ SQL cru PostGIS) e `RedisService` |
| Integrations | `src/integrations` | Storage S3, notificacoes |
| Modules | `src/modules` | Regra de negocio por dominio |

## Autenticacao

1. `POST /auth/otp/request` cria um codigo de 6 digitos com hash SHA-256 + pepper, TTL de 5 min, cooldown de 60 s e no maximo 5 tentativas.
2. `POST /auth/otp/verify` consome o codigo e cria a conta na primeira entrada (fluxo Uber). Retorna `accessToken` (15 min) + `refreshToken` (30 dias).
3. O refresh token e **rotativo e de uso unico**: cada `/auth/refresh` revoga o anterior e grava `replacedBy`. Reuso de um token antigo retorna 401.
4. Dispositivos registrados em `devices` guardam o `fcmToken` para push.

## Documentos do motorista

Fluxo em duas etapas com URL pre-assinada — o arquivo **nunca** passa pelo backend:

```
App ──POST /documents/upload-url──> API ── presign ──> S3
App ──PUT arquivo────────────────────────────────────> S3
App ──POST /documents/confirm─────> API ── HeadObject ─> S3 (valida existencia)
Admin ──PATCH /admin/documents/:id/review──> API
Admin ──PATCH /admin/drivers/:id/review───> API (exige todos os docs aprovados)
```

`DriversService.getDocumentProgress()` calcula o que falta, o que esta pendente e o que foi reprovado; e a fonte de verdade usada tanto pelo app quanto pelo painel.

## Geoespacial

PostGIS e a fonte de verdade para posicao. `PrismaService` expoe:

- `upsertDriverLocation()` — upsert com `ST_MakePoint` + cast para `geography`;
- `findNearbyDrivers()` — `ST_DWithin` + `ST_Distance` ordenado, filtrando `last_seen_at < 2 min`;
- `findSurgeMultiplier()` — `ST_Contains` nas zonas de surge ativas.

## Envelope de resposta

Sucesso: `{ "success": true, "data": ..., "timestamp": "..." }`
Erro: `{ "success": false, "error": { "code": "OTP_INVALID", "message": "...", "details": [...] }, "path": "/api/auth/otp/verify" }`
