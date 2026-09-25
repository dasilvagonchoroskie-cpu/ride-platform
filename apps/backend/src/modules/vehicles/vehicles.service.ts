import { Injectable } from '@nestjs/common';
import { ERROR_CODES, normalizePlate } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip } from '../../common/dto/pagination.dto';
import { CreateVehicleInput, UpdateVehicleInput } from '@ride/shared';

/// Modalidade unica: nao ha categoria de veiculo. O que existe aqui e so
/// o cadastro do veiculo do motorista e a listagem administrativa.
@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------- MOTORISTA ---------------------------

  async listMine(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    return this.prisma.vehicle.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, input: CreateVehicleInput) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    const plate = normalizePlate(input.plate);
    const plateTaken = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (plateTaken) {
      throw BusinessException.conflict('Placa ja cadastrada.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
    }

    return this.prisma.vehicle.create({
      data: {
        driverId: driver.id,
        plate,
        brand: input.brand,
        model: input.model,
        year: input.year,
        color: input.color,
        isActive: input.isActive,
      },
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

  // ------------------------------- ADMIN -------------------------------

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
          driver: { select: { id: true, status: true, user: { select: { name: true, phone: true } } } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return buildPaginated(items, total, params.page, params.limit);
  }
}
