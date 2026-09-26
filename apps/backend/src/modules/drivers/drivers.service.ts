import { Injectable, Logger } from '@nestjs/common';
import { ACTIVE_RIDE_STATUSES, ERROR_CODES, DriverStatus, DocumentStatus, REQUIRED_DRIVER_DOCUMENTS, UserRole, UserStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip } from '../../common/dto/pagination.dto';
import { DriversRepository } from './drivers.repository';
import { StorageService } from '../../integrations/storage/storage.service';
import {
  DriverOnboardingInput,
  UpdateDriverInput,
  UpdateDriverLocationInput,
  ReviewDriverInput,
} from '@ride/shared';


/** Acao gravada na auditoria quando a Central aprova sem as fotos no sistema. */
const APROVACAO_PRESENCIAL = 'DRIVER_APPROVED_PRESENTIAL';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly repo: DriversRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Onboarding do motorista: cria o registro e a carteira virtual. */
  async onboard(userId: string, input: DriverOnboardingInput) {
    const existing = await this.repo.findByUserId(userId);
    if (existing) {
      throw BusinessException.conflict('Motorista ja cadastrado.', ERROR_CODES.DRIVER_ALREADY_EXISTS);
    }

    const conflict = await this.repo.findByCpfOrCnh({ cpf: input.cpf, cnhNumber: input.cnhNumber });
    if (conflict) {
      throw BusinessException.conflict('CPF ou CNH ja vinculados a outro motorista.', ERROR_CODES.CONFLICT);
    }

    const driver = await this.prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: {
          userId,
          status: DriverStatus.PENDING,
          cpf: input.cpf,
          birthDate: input.birthDate,
          cnhNumber: input.cnhNumber,
          cnhCategory: input.cnhCategory,
          cnhExpiresAt: input.cnhExpiresAt,
          pixKey: input.pixKey,
        },
      });

      await tx.wallet.create({ data: { driverId: created.id } });

      await tx.user.update({
        where: { id: userId },
        data: { role: UserRole.DRIVER, status: UserStatus.ACTIVE, cpf: input.cpf, birthDate: input.birthDate },
      });

      return created;
    });

    return this.withProgress(driver.id);
  }

  async getMe(userId: string) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');
    return this.withProgress(driver.id);
  }

  async updateMe(userId: string, input: UpdateDriverInput) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    await this.repo.update(driver.id, {
      ...(input.birthDate ? { birthDate: input.birthDate } : {}),
      ...(input.cnhNumber ? { cnhNumber: input.cnhNumber } : {}),
      ...(input.cnhCategory ? { cnhCategory: input.cnhCategory } : {}),
      ...(input.cnhExpiresAt ? { cnhExpiresAt: input.cnhExpiresAt } : {}),
      ...(input.pixKey !== undefined ? { pixKey: input.pixKey } : {}),
    });

    return this.withProgress(driver.id);
  }

  /** Alterna Online/Offline. Exige aprovacao, documentos completos e veiculo ativo. */
  async setOnline(userId: string, isOnline: boolean) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    if (isOnline) {
      if (driver.status !== DriverStatus.APPROVED) {
        throw new BusinessException(
          ERROR_CODES.DRIVER_NOT_APPROVED,
          'Sua conta ainda nao foi aprovada para ficar online.',
          403,
        );
      }

      const progress = await this.getDocumentProgress(driver.id);
      // Aprovado com conferencia presencial: as fotos ainda nao existem no
      // sistema, mas os documentos foram vistos pela Central.
      if (!progress.isComplete && !(await this.aprovadoPresencialmente(driver.id))) {
        throw new BusinessException(
          ERROR_CODES.DOCUMENTS_INCOMPLETE,
          `Documentos pendentes: ${progress.missing.join(', ')}.`,
          422,
          progress,
        );
      }

      const activeVehicles = await this.prisma.vehicle.count({ where: { driverId: driver.id, isActive: true } });
      if (activeVehicles === 0) {
        throw BusinessException.validation('Cadastre um veiculo ativo antes de ficar online.');
      }

      if (driver.cnhExpiresAt < new Date()) {
        throw BusinessException.validation('Sua CNH esta vencida. Atualize o documento.');
      }
    }

    const updated = await this.repo.update(driver.id, { isOnline });

    await this.prisma.$executeRaw`
      UPDATE driver_locations SET is_online = ${isOnline}, is_available = ${isOnline}, updated_at = NOW()
      WHERE driver_id = ${driver.id}::uuid
    `;

    this.logger.log(`Motorista ${driver.id} -> ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    return { id: updated.id, isOnline: updated.isOnline, status: updated.status };
  }

  /** Atualiza a posicao do motorista (chamado pelo app a cada poucos segundos). */
  async updateLocation(userId: string, input: UpdateDriverLocationInput) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    const activeRide = await this.prisma.ride.count({
      where: { driverId: driver.id, status: { in: [...ACTIVE_RIDE_STATUSES] } },
    });

    await this.prisma.upsertDriverLocation({
      driverId: driver.id,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading ?? null,
      speed: input.speed ?? null,
      accuracy: input.accuracy ?? null,
      isOnline: driver.isOnline,
      isAvailable: driver.isOnline && activeRide === 0,
    });

    return { updatedAt: new Date().toISOString(), isAvailable: driver.isOnline && activeRide === 0 };
  }

  // ------------------------------ ADMIN ------------------------------

  async adminList(params: { page: number; limit: number; status?: DriverStatus; isOnline?: boolean; search?: string }) {
    const { items, total } = await this.repo.list({
      skip: toSkip(params.page, params.limit),
      take: params.limit,
      status: params.status,
      isOnline: params.isOnline,
      search: params.search,
    });

    const drivers = await Promise.all(
      items.map(async (driver) => ({
        ...driver,
        documents: await this.getDocumentProgress(driver.id),
      })),
    );

    return buildPaginated(drivers, total, params.page, params.limit);
  }

  async adminDetail(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true, avatarUrl: true, status: true, createdAt: true },
        },
        vehicles: true,
        documents: { orderBy: { createdAt: 'desc' } },
        wallet: true,
      },
    });

    if (!driver) throw BusinessException.notFound('Motorista nao encontrado.');

    const documents = await Promise.all(
      driver.documents.map(async (doc) => ({
        ...doc,
        fileUrl: await this.storage.createPresignedDownload(doc.fileKey),
      })),
    );

    return {
      ...driver,
      documents,
      progress: await this.getDocumentProgress(driverId),
    };
  }

  /** A Central aprovou este motorista conferindo os documentos pessoalmente? */
  private async aprovadoPresencialmente(driverId: string): Promise<boolean> {
    const registro = await this.prisma.auditLog.findFirst({
      where: { entity: 'Driver', entityId: driverId, action: APROVACAO_PRESENCIAL },
      select: { id: true },
    });
    return registro !== null;
  }

  /** Aprova, reprova ou suspende o motorista. */
  async adminReview(driverId: string, reviewerId: string, input: ReviewDriverInput) {
    const driver = await this.repo.findById(driverId);
    if (!driver) throw BusinessException.notFound('Motorista nao encontrado.');

    // Documentos sem foto no sistema, aprovados por conferencia presencial.
    let semFoto: string[] | null = null;
    if (input.status === DriverStatus.APPROVED) {
      const progress = await this.getDocumentProgress(driverId);
      if (!progress.isComplete) {
        if (!input.presentialCheck) {
          throw new BusinessException(
            ERROR_CODES.DOCUMENTS_INCOMPLETE,
            `Nao e possivel aprovar: documentos pendentes (${progress.missing.join(', ')}). ` +
              'Para aprovar conferindo pessoalmente, use a conferencia presencial na Central.',
            422,
            progress,
          );
        }
        semFoto = progress.missing;
      }
      if (driver.cnhExpiresAt < new Date()) {
        throw BusinessException.validation('CNH vencida: reprove e solicite atualizacao.');
      }
    }

    const updated = await this.repo.update(driverId, {
      status: input.status,
      approvedAt: input.status === DriverStatus.APPROVED ? new Date() : null,
      approvedBy: input.status === DriverStatus.APPROVED ? reviewerId : null,
      rejectionReason: input.status === DriverStatus.APPROVED ? null : (input.reason ?? 'Sem justificativa informada.'),
      isOnline: input.status === DriverStatus.APPROVED ? driver.isOnline : false,
    });

    if (semFoto) {
      // Registro permanente: quem aprovou sem as fotos, quando e o que conferiu.
      await this.prisma.auditLog.create({
        data: {
          actorId: reviewerId,
          actorRole: 'ADMIN',
          action: APROVACAO_PRESENCIAL,
          entity: 'Driver',
          entityId: driverId,
          after: { conferencia: input.reason ?? '', documentosSemFoto: semFoto },
        },
      });
    }

    this.logger.log(`Motorista ${driverId} revisado -> ${input.status} por ${reviewerId}`);
    return this.withProgress(updated.id);
  }

  /** Mapa do admin: motoristas online com posicao atual. */
  async adminActiveDrivers() {
    return this.prisma.$queryRaw<
      Array<{
        driverId: string;
        name: string;
        phone: string;
        ratingAvg: number;
        totalRides: number;
        latitude: number;
        longitude: number;
        isAvailable: boolean;
        lastSeenAt: Date;
      }>
    >`
      SELECT
        d.id            AS "driverId",
        u.name          AS "name",
        u.phone         AS "phone",
        d.rating_avg::float AS "ratingAvg",
        d.total_rides   AS "totalRides",
        ST_Y(dl.location::geometry) AS "latitude",
        ST_X(dl.location::geometry) AS "longitude",
        dl.is_available AS "isAvailable",
        dl.last_seen_at AS "lastSeenAt"
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      JOIN driver_locations dl ON dl.driver_id = d.id
      WHERE d.status = 'APPROVED' AND d.is_online = TRUE
        AND dl.last_seen_at > NOW() - INTERVAL '5 minutes'
      ORDER BY d.is_online DESC, dl.last_seen_at DESC
      LIMIT 500
    `;
  }

  // ------------------------------ HELPERS ------------------------------

  /** Situacao dos documentos obrigatorios do motorista. */
  async getDocumentProgress(driverId: string) {
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      select: { type: true, status: true, uploadedAt: true },
    });

    const latestByType = new Map<string, { status: DocumentStatus; uploadedAt: Date | null }>();
    for (const doc of documents) {
      if (!latestByType.has(doc.type)) latestByType.set(doc.type, { status: doc.status, uploadedAt: doc.uploadedAt });
    }

    const missing = REQUIRED_DRIVER_DOCUMENTS.filter((type) => !latestByType.has(type));
    const pending = REQUIRED_DRIVER_DOCUMENTS.filter(
      (type) => latestByType.get(type)?.status === DocumentStatus.PENDING,
    );
    const rejected = REQUIRED_DRIVER_DOCUMENTS.filter(
      (type) => latestByType.get(type)?.status === DocumentStatus.REJECTED,
    );

    return {
      total: REQUIRED_DRIVER_DOCUMENTS.length,
      sent: latestByType.size,
      approved: REQUIRED_DRIVER_DOCUMENTS.filter(
        (type) => latestByType.get(type)?.status === DocumentStatus.APPROVED,
      ).length,
      missing,
      pending,
      rejected,
      isComplete:
        missing.length === 0 &&
        pending.length === 0 &&
        rejected.length === 0 &&
        REQUIRED_DRIVER_DOCUMENTS.every(
          (type) => latestByType.get(type)?.status === DocumentStatus.APPROVED,
        ),
    };
  }

  private async withProgress(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true } },
        vehicles: { where: { isActive: true } },
        wallet: true,
      },
    });

    return { ...driver, progress: await this.getDocumentProgress(driverId) };
  }
}
