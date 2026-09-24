import { Injectable } from '@nestjs/common';
import { ERROR_CODES, normalizePlate } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip } from '../../common/dto/pagination.dto';
import {
  CreateVehicleCategoryInput,
  CreateVehicleInput,
  UpdateVehicleCategoryInput,
  UpdateVehicleInput,
} from '@ride/shared';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------- MOTORISTA ---------------------------

  async listMine(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    return this.prisma.vehicle.findMany({
      where: { driverId: driver.id },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, input: CreateVehicleInput) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    const category = await this.prisma.vehicleCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
    });
    if (!category) throw BusinessException.validation('Categoria de veiculo invalida.');

    const plate = normalizePlate(input.plate);
    const plateTaken = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (plateTaken) {
      throw BusinessException.conflict('Placa ja cadastrada.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
    }

    return this.prisma.vehicle.create({
      data: {
        driverId: driver.id,
        categoryId: input.categoryId,
        plate,
        brand: input.brand,
        model: input.model,
        year: input.year,
        color: input.color,
        isActive: input.isActive,
      },
      include: { category: true },
    });
  }

  async update(userId: string, vehicleId: string, input: UpdateVehicleInput) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, driver: { userId } } });
    if (!vehicle) throw BusinessException.notFound('Veiculo nao encontrado.');

    if (input.plate) {
      const plate = normalizePlate(input.plate);
      const taken = await this.prisma.vehicle.findFirst({ where: { plate, NOT: { id: vehicleId } } });
      if (taken) throw BusinessException.conflict('Placa ja cadastrada.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { ...input, ...(input.plate ? { plate: normalizePlate(input.plate) } : {}) },
      include: { category: true },
    });
  }

  async remove(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, driver: { userId } } });
    if (!vehicle) throw BusinessException.notFound('Veiculo nao encontrado.');

    const activeRide = await this.prisma.ride.count({
      where: { vehicleId, status: { in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'] } },
    });
    if (activeRide > 0) throw BusinessException.conflict('Veiculo em uso em uma corrida ativa.');

    await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { isActive: false } });
  }

  // ------------------------------ PUBLICO ------------------------------

  listActiveCategories() {
    return this.prisma.vehicleCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        fareConfigs: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
      },
    });
  }

  // ------------------------------- ADMIN -------------------------------

  async adminListCategories() {
    return this.prisma.vehicleCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        fareConfigs: { orderBy: { validFrom: 'desc' } },
        _count: { select: { vehicles: true, rides: true } },
      },
    });
  }

  async adminCreateCategory(input: CreateVehicleCategoryInput) {
    const exists = await this.prisma.vehicleCategory.findUnique({ where: { slug: input.slug } });
    if (exists) throw BusinessException.conflict('Ja existe uma categoria com este slug.');
    return this.prisma.vehicleCategory.create({ data: input });
  }

  async adminUpdateCategory(categoryId: string, input: UpdateVehicleCategoryInput) {
    const category = await this.prisma.vehicleCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw BusinessException.notFound('Categoria nao encontrada.');
    return this.prisma.vehicleCategory.update({ where: { id: categoryId }, data: input });
  }

  /** Define a tarifa vigente de uma categoria (histórico preservado). */
  async adminUpsertFare(categoryId: string, fare: {
    baseFareCents: number;
    perKmCents: number;
    perMinuteCents: number;
    minFareCents: number;
    bookingFeeCents?: number;
    cancellationFeeCents?: number;
    waitingPerMinuteCents?: number;
    surgeEnabled?: boolean;
    maxSurgeMultiplier?: number;
    commissionPercent?: number;
  }) {
    const category = await this.prisma.vehicleCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw BusinessException.notFound('Categoria nao encontrada.');

    return this.prisma.$transaction(async (tx) => {
      await tx.fareConfig.updateMany({ where: { categoryId, isActive: true }, data: { isActive: false } });
      return tx.fareConfig.create({
        data: {
          categoryId,
          baseFareCents: fare.baseFareCents,
          perKmCents: fare.perKmCents,
          perMinuteCents: fare.perMinuteCents,
          minFareCents: fare.minFareCents,
          bookingFeeCents: fare.bookingFeeCents ?? 0,
          cancellationFeeCents: fare.cancellationFeeCents ?? 0,
          waitingPerMinuteCents: fare.waitingPerMinuteCents ?? 0,
          surgeEnabled: fare.surgeEnabled ?? true,
          maxSurgeMultiplier: fare.maxSurgeMultiplier ?? 2,
          commissionPercent: fare.commissionPercent ?? 20,
          isActive: true,
        },
      });
    });
  }

  async adminListVehicles(params: { page: number; limit: number; search?: string }) {
    const where = params.search
      ? {
          OR: [
            { plate: { contains: params.search.toUpperCase() } },
            { brand: { contains: params.search, mode: 'insensitive' as const } },
            { model: { contains: params.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        skip: toSkip(params.page, params.limit),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          driver: { select: { id: true, status: true, user: { select: { name: true, phone: true } } } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return buildPaginated(items, total, params.page, params.limit);
  }
}
