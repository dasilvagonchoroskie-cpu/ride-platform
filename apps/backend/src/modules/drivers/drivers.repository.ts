import { Injectable } from '@nestjs/common';
import { Driver, DriverStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { id } });
  }

  findByUserId(userId: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { userId } });
  }

  findByCpfOrCnh(params: { cpf?: string; cnhNumber?: string }): Promise<Driver | null> {
    return this.prisma.driver.findFirst({
      where: {
        OR: [
          ...(params.cpf ? [{ cpf: params.cpf }] : []),
          ...(params.cnhNumber ? [{ cnhNumber: params.cnhNumber }] : []),
        ],
      },
    });
  }

  create(data: Prisma.DriverCreateInput): Promise<Driver> {
    return this.prisma.driver.create({ data });
  }

  update(id: string, data: Prisma.DriverUpdateInput): Promise<Driver> {
    return this.prisma.driver.update({ where: { id }, data });
  }

  async list(params: {
    skip: number;
    take: number;
    status?: DriverStatus;
    isOnline?: boolean;
    search?: string;
  }) {
    const where: Prisma.DriverWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.isOnline !== undefined ? { isOnline: params.isOnline } : {}),
      ...(params.search
        ? {
            user: {
              OR: [
                { name: { contains: params.search, mode: 'insensitive' } },
                { phone: { contains: params.search } },
                { email: { contains: params.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true, status: true } },
          vehicles: { where: { isActive: true }, include: { category: true } },
          _count: { select: { documents: true } },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return { items, total };
  }
}
