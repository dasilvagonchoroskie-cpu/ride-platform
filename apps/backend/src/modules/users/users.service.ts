import { Injectable } from '@nestjs/common';
import { ERROR_CODES, UserRole, UserStatus, normalizePhone } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip, PaginatedResult } from '../../common/dto/pagination.dto';
import { UsersRepository } from './users.repository';
import { UpdateProfileInput, CreateAddressInput, UpdateAddressInput } from '@ride/shared';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        driver: { select: { id: true, status: true, isOnline: true, ratingAvg: true, totalRides: true } },
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
      },
    });

    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');

    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    if (input.email) {
      const taken = await this.prisma.user.findFirst({ where: { email: input.email, NOT: { id: userId } } });
      if (taken) throw BusinessException.conflict('E-mail ja utilizado.', ERROR_CODES.EMAIL_ALREADY_USED);
    }

    const user = await this.repo.update(userId, {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email, emailVerifiedAt: null } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.birthDate ? { birthDate: input.birthDate } : {}),
      ...(input.cpf ? { cpf: input.cpf.replace(/\D+/g, '') } : {}),
    });

    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async listAddresses(userId: string) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, input: CreateAddressInput) {
    const count = await this.prisma.userAddress.count({ where: { userId } });

    if (input.label && count > 0) {
      const duplicate = await this.prisma.userAddress.findFirst({ where: { userId, label: input.label } });
      if (duplicate) throw BusinessException.conflict('Ja existe um endereco com este apelido.');
    }

    const address = await this.prisma.userAddress.create({
      data: { ...input, userId, isDefault: count === 0 },
    });

    return address;
  }

  async updateAddress(userId: string, addressId: string, input: UpdateAddressInput) {
    await this.assertAddressOwner(userId, addressId);
    return this.prisma.userAddress.update({ where: { id: addressId }, data: input });
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    await this.assertAddressOwner(userId, addressId);
    await this.prisma.userAddress.delete({ where: { id: addressId } });
  }

  async setDefaultAddress(userId: string, addressId: string) {
    await this.assertAddressOwner(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.userAddress.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }

  async adminList(params: {
    page: number;
    limit: number;
    role?: UserRole;
    status?: UserStatus;
    search?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { items, total } = await this.repo.list({
      skip: toSkip(params.page, params.limit),
      take: params.limit,
      role: params.role,
      status: params.status,
      search: params.search,
    });

    const sanitized = items.map(({ passwordHash: _passwordHash, ...rest }) => rest);
    return buildPaginated(sanitized, total, params.page, params.limit);
  }

  async adminGet(userId: string) {
    return this.getProfile(userId);
  }

  async adminSetBlocked(userId: string, blocked: boolean, reason?: string) {
    const user = await this.repo.findById(userId);
    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');
    if (user.role === UserRole.ADMIN) {
      throw BusinessException.forbidden('Nao e possivel bloquear um administrador.');
    }

    const updated = await this.repo.update(userId, {
      status: blocked ? UserStatus.BLOCKED : UserStatus.ACTIVE,
      blockedReason: blocked ? (reason ?? 'Bloqueado pelo administrador.') : null,
    });

    if (blocked) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.driver.updateMany({ where: { userId }, data: { isOnline: false } });
    }

    const { passwordHash: _passwordHash, ...safe } = updated;
    return safe;
  }

  private async assertAddressOwner(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw BusinessException.notFound('Endereco nao encontrado.');
  }
}
