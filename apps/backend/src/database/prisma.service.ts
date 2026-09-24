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
        location = EXCLUDED.location,
        heading = EXCLUDED.heading,
        speed = EXCLUDED.speed,
        accuracy = EXCLUDED.accuracy,
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
  }): Promise<Array<{ driverId: string; distanceMeters: number; latitude: number; longitude: number }>> {
    const limit = params.limit ?? 20;
    return this.$queryRaw<Array<{ driverId: string; distanceMeters: number; latitude: number; longitude: number }>>`
      SELECT
        dl.driver_id                     AS "driverId",
        ST_Distance(dl.location, ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography) AS "distanceMeters",
        ST_Y(dl.location::geometry)      AS "latitude",
        ST_X(dl.location::geometry)      AS "longitude"
      FROM driver_locations dl
      JOIN drivers d ON d.id = dl.driver_id
      WHERE d.status = 'APPROVED'
        AND d.is_online = TRUE
        AND dl.is_available = TRUE
        AND dl.last_seen_at > NOW() - INTERVAL '2 minutes'
        AND ST_DWithin(
          dl.location,
          ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography,
          ${params.radiusMeters}
        )
      ORDER BY "distanceMeters" ASC
      LIMIT ${limit}
    `;
  }

  /** Verifica se um ponto esta dentro de alguma zona de surge ativa. */
  async findSurgeMultiplier(latitude: number, longitude: number): Promise<number> {
    const rows = await this.$queryRaw<Array<{ multiplier: number }>>`
      SELECT multiplier::float AS multiplier
      FROM surge_zones
      WHERE is_active = TRUE
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at >= NOW())
        AND ST_Contains(
          boundary::geometry,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
        )
      ORDER BY multiplier DESC
      LIMIT 1
    `;
    return rows.length > 0 ? Number(rows[0].multiplier) : 1;
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
