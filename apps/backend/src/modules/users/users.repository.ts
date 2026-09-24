import { Injectable } from '@nestjs/common';
import { Prisma, User, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByPhoneOrEmail(params: { phone?: string; email?: string }): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          ...(params.phone ? [{ phone: params.phone }] : []),
          ...(params.email ? [{ email: params.email }] : []),
        ],
      },
    });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async list(params: {
    skip: number;
    take: number;
    role?: UserRole;
    status?: UserStatus;
    search?: string;
  }): Promise<{ items: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(params.role ? { role: params.role } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { phone: { contains: params.search } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip: params.skip, take: params.take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }
}
