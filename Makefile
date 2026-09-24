.PHONY: help setup install infra-up infra-down infra-reset build shared backend-dev migrate seed test test-e2e studio lint clean

help:
	@echo "Ride Platform - comandos disponiveis"
	@echo ""
	@echo "  make setup        Instala dependencias, sobe a infra, migra e semeia o banco"
	@echo "  make infra-up     Sobe PostgreSQL/PostGIS, Redis, MinIO e MailHog"
	@echo "  make infra-down   Derruba a infraestrutura"
	@echo "  make infra-reset  Derruba e apaga os volumes (banco zerado)"
	@echo "  make shared       Compila o pacote @ride/shared"
	@echo "  make backend-dev  Sobe a API em modo watch (http://localhost:3333)"
	@echo "  make migrate      Aplica as migrations do Prisma"
	@echo "  make seed         Popula categorias, tarifas, admin e cupom"
	@echo "  make test         Testes unitarios"
	@echo "  make test-e2e     Testes end-to-end (exige infra no ar + banco migrado)"
	@echo "  make studio       Abre o Prisma Studio"
	@echo "  make clean        Remove node_modules e artefatos de build"

install:
	pnpm install

infra-up:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down

infra-reset:
	docker compose -f infra/docker-compose.yml down -v
	docker compose -f infra/docker-compose.yml up -d

shared:
	pnpm --filter @ride/shared build

build:
	pnpm build

backend-dev:
	pnpm --filter @ride/backend start:dev

migrate:
	pnpm --filter @ride/backend prisma:migrate -- --name init
	pnpm --filter @ride/backend prisma:postinit

seed:
	pnpm --filter @ride/backend prisma:seed

test:
	pnpm --filter @ride/backend test

test-e2e:
	pnpm --filter @ride/backend test:e2e

studio:
	pnpm --filter @ride/backend prisma:studio

lint:
	pnpm lint

setup: install infra-up shared migrate seed
	@echo ""
	@echo "Pronto. Rode: make backend-dev"
