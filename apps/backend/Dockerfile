# ---------- build ----------
FROM node:20-alpine AS builder
# OpenSSL tambem aqui: e neste estagio que o Prisma gera o motor de
# consulta. Sem ele, o Prisma chuta a versao 1.1 e o motor gerado nao
# roda no estagio final, que tem OpenSSL 3.
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN pnpm --filter @ride/shared build \
 && pnpm --filter @ride/backend exec prisma generate \
 && pnpm --filter @ride/backend build

# ---------- runtime ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl curl && corepack enable
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3333/api/health || exit 1

CMD ["node", "dist/main.js"]
