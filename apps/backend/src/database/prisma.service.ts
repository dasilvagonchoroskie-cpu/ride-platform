import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      log: config.isProduction
        ? [{ emit: 'event', level: 'error' }]
        : [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado ao PostgreSQL.');
    await this.ajustesDeSeguranca();
  }

  /**
   * Ajustes de seguranca que so o dono dos objetos (o usuario do app) pode
   * fazer. Idempotente: roda a cada partida e nao muda nada se ja estiver ok.
   * - set_updated_at com search_path fixo (aviso do Supabase, 11/10/2026).
   */
  private async ajustesDeSeguranca(): Promise<void> {
    try {
      await this.$executeRawUnsafe('ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public');
    } catch (e) {
      this.logger.warn(`Ajuste de seguranca do banco nao aplicado: ${(e as Error).message}`);
    }
    // Auditoria de 06/11/2026: o Supabase abre as tabelas do schema public
    // pela API dele (PostgREST) para quem tiver a chave publica. O servidor
    // nao usa essa API. Ligar a "seguranca por linha" (RLS) sem regras
    // fecha essa porta; o usuario do servidor e o dono das tabelas e o dono
    // nao e afetado pelo RLS, entao nada muda para o aplicativo.
    try {
      const tabelas = await this.$queryRaw<Array<{ nome: string }>>`
        SELECT c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
          AND pg_get_userbyid(c.relowner) = current_user`;
      for (const t of tabelas) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.nome)) continue;
        await this.$executeRawUnsafe(`ALTER TABLE public."${t.nome}" ENABLE ROW LEVEL SECURITY`);
      }
      if (tabelas.length) this.logger.log(`RLS ligado em ${tabelas.length} tabela(s) do schema public.`);
    } catch (e) {
      this.logger.warn(`RLS nao ligado: ${(e as Error).message}`);
    }
  }

  /** Para a Central e o teste de ponta a ponta: tabelas do public sem RLS. */
  async tabelasSemRls(): Promise<{ total: number; semRls: string[] }> {
    const linhas = await this.$queryRaw<Array<{ nome: string; rls: boolean }>>`
      SELECT c.relname AS nome, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`;
    return { total: linhas.length, semRls: linhas.filter((l) => !l.rls).map((l) => l.nome).sort() };
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Executa um bloco dentro de uma transacao. */
  async withTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(handler, { timeout: 20000 });
  }

  /** Upsert da posicao do motorista (PostGIS nao e acessivel pelo Prisma Client). */
  async upsertDriverLocation(params: {
    driverId: string;
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    isOnline: boolean;
    isAvailable: boolean;
  }): Promise<void> {
    await this.$executeRaw`
      INSERT INTO driver_locations (id, driver_id, location, heading, speed, accuracy, is_online, is_available, last_seen_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${params.driverId}::uuid,
        ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography,
        ${params.heading ?? null},
        ${params.speed ?? null},
        ${params.accuracy ?? null},
        ${params.isOnline},
        ${params.isAvailable},
        NOW(),
        NOW()
      )
      ON CONFLICT (driver_id) DO UPDATE SET
        -- 30/10/2026 (Evandro: "melhorar a precisao do GPS"): leitura ruim
        -- (mais de 60 m de erro, ex.: rede de celular) nao tira o carro de uma
        -- posicao boa (ate 30 m) de menos de 1 minuto; so renova o "visto".
        location = CASE WHEN EXCLUDED.accuracy > 60 AND driver_locations.accuracy <= 30 AND driver_locations.last_seen_at > NOW() - INTERVAL '60 seconds' THEN driver_locations.location ELSE EXCLUDED.location END,
        -- Sem rumo nesta leitura (parado, celular sem bussola): fica o ultimo.
        heading = COALESCE(EXCLUDED.heading, driver_locations.heading),
        speed = EXCLUDED.speed,
        accuracy = CASE WHEN EXCLUDED.accuracy > 60 AND driver_locations.accuracy <= 30 AND driver_locations.last_seen_at > NOW() - INTERVAL '60 seconds' THEN driver_locations.accuracy ELSE EXCLUDED.accuracy END,
        is_online = EXCLUDED.is_online,
        is_available = EXCLUDED.is_available,
        last_seen_at = NOW(),
        updated_at = NOW()
    `;
  }

  /** Motoristas disponiveis em um raio (metros), ordenados por distancia. */
  async findNearbyDrivers(params: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    limit?: number;
    /** So motoristas com veiculo ativo desta categoria (CARRO, MOTO...). */
    category?: string;
    /** Ou: qualquer uma destas categorias (carro de categoria mais alta atende a mais baixa). */
    categorias?: string[];
    /**
     * Entrega (Etapa 5): em vez da categoria, o tipo de veiculo que a cidade
     * liberou — CARRO (qualquer carro), MOTO ou TODOS.
     */
    veiculos?: 'CARRO' | 'MOTO' | 'TODOS';
    /**
     * Corrida do teste automatico so vai para motorista do teste, e corrida
     * de verdade nunca vai para motorista do teste (Evandro, 08/10/2026: o
     * celular dele tocou chamado de teste na rua).
     */
    teste?: boolean;
  }): Promise<Array<{ driverId: string; distanceMeters: number; latitude: number; longitude: number; heading: number | null }>> {
    const limit = params.limit ?? 20;
    const categoria = params.category ?? 'CARRO';
    const categorias = params.categorias && params.categorias.length > 0 ? params.categorias : [categoria];
    const teste = params.teste === true;
    // '' = filtra pela categoria; senao pelo tipo de veiculo da entrega.
    const veiculos = params.veiculos ?? '';
    return this.$queryRaw<Array<{ driverId: string; distanceMeters: number; latitude: number; longitude: number; heading: number | null }>>`
      SELECT
        dl.driver_id                     AS "driverId",
        ST_Distance(dl.location, ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography) AS "distanceMeters",
        ST_Y(dl.location::geometry)      AS "latitude",
        ST_X(dl.location::geometry)      AS "longitude",
        dl.heading                       AS "heading"
      FROM driver_locations dl
      JOIN drivers d ON d.id = dl.driver_id
      JOIN users u ON u.id = d.user_id
      WHERE d.status = 'APPROVED'
        AND d.is_online = TRUE
        AND dl.is_available = TRUE
        AND COALESCE(u.metadata->>'teste' = 'true', FALSE) = ${teste}
        AND dl.last_seen_at > NOW() - INTERVAL '2 minutes'
        AND EXISTS (
          SELECT 1 FROM vehicles v
          WHERE v.driver_id = d.id AND v.is_active = TRUE
            AND (
              (${veiculos} = '' AND v.category = ANY(${categorias}::text[]))
              OR ${veiculos} = 'TODOS'
              OR (${veiculos} = 'MOTO' AND UPPER(v.category) LIKE '%MOTO%')
              OR (${veiculos} = 'CARRO' AND UPPER(v.category) NOT LIKE '%MOTO%')
            )
        )
        AND ST_DWithin(
          dl.location,
          ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography,
          ${params.radiusMeters}
        )
      ORDER BY "distanceMeters" ASC
      LIMIT ${limit}
    `;
  }


  /** Conta criada pelo teste automatico (entrou com a chave de teste). */
  async contaDeTeste(userId: string): Promise<boolean> {
    const u = await this.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    return (u?.metadata as { teste?: boolean } | null)?.teste === true;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
