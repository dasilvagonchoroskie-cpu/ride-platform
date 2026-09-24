import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
  adminListUsersSchema,
  blockUserSchema,
  paginationSchema,
  UserRole,
  UserStatus,
} from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil completo do usuario autenticado' })
  me(@CurrentUser('id') userId: string) {
    return this.users.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza nome, e-mail, foto, CPF ou data de nascimento' })
  update(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(updateProfileSchema)) body: never) {
    return this.users.updateProfile(userId, body);
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Lista enderecos salvos' })
  listAddresses(@CurrentUser('id') userId: string) {
    return this.users.listAddresses(userId);
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Cria endereco salvo (casa, trabalho...)' })
  createAddress(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(createAddressSchema)) body: never) {
    return this.users.createAddress(userId, body);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Atualiza endereco salvo' })
  updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: never,
  ) {
    return this.users.updateAddress(userId, addressId, body);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove endereco salvo' })
  async deleteAddress(@CurrentUser('id') userId: string, @Param('id') addressId: string): Promise<void> {
    await this.users.deleteAddress(userId, addressId);
  }

  @Patch('me/addresses/:id/default')
  @ApiOperation({ summary: 'Define o endereco como padrao' })
  setDefaultAddress(@CurrentUser('id') userId: string, @Param('id') addressId: string) {
    return this.users.setDefaultAddress(userId, addressId);
  }
}

@ApiTags('Admin - Usuarios')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista usuarios com filtros e paginacao' })
  list(
    @Query(new ZodValidationPipe(paginationSchema.merge(adminListUsersSchema))) query: never,
  ) {
    const q = query as { page: number; limit: number; search?: string; role?: UserRole; status?: UserStatus };
    return this.users.adminList(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um usuario' })
  detail(@Param('id') id: string) {
    return this.users.adminGet(id);
  }

  @Patch(':id/block')
  @ApiOperation({ summary: 'Bloqueia ou desbloqueia um usuario' })
  block(@Param('id') id: string, @Body(new ZodValidationPipe(blockUserSchema)) body: { blocked: boolean; reason?: string }) {
    return this.users.adminSetBlocked(id, body.blocked, body.reason);
  }
}
