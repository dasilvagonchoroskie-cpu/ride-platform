import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createVehicleSchema,
  driverOnboardingSchema,
  emailSchema,
  listDriversSchema,
  nameSchema,
  normalizePhone,
  paginationSchema,
  reviewDriverSchema,
  UserRole,
} from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriversService } from './drivers.service';

/**
 * Motorista cadastrado direto pela Central (pedido do Evandro, 08/10/2026).
 * O motorista depois so entra no app do motorista com este telefone e o
 * codigo — o cadastro ja esta pronto.
 */
const criarMotoristaSchema = driverOnboardingSchema
  .omit({ name: true, email: true, phone: true, pixKey: true })
  .extend({
    name: nameSchema,
    phone: z
      .string()
      .transform((t) => normalizePhone(t))
      .refine((t) => /^\+55\d{10,11}$/.test(t), 'Telefone invalido: use DDD + numero.'),
    email: emailSchema.optional(),
    vehicle: createVehicleSchema.omit({ isActive: true }),
    /** Ja aprovado (conferido pessoalmente na Central). */
    aprovar: z.boolean().default(true),
    /** Cidade onde vai trabalhar (o operador cadastra sempre na dele). */
    praca: z.string().trim().max(40).optional(),
  });

export type CriarMotoristaInput = z.infer<typeof criarMotoristaSchema>;

@ApiTags('Admin - Motoristas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(
    private readonly drivers: DriversService,
    private readonly pracas: PracasService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra o motorista pela Central (dados, CNH e veiculo); ja aprovado se pedido' })
  async criar(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(criarMotoristaSchema)) body: CriarMotoristaInput) {
    const minha = await this.pracas.escopoDe(user.id);
    const praca = minha ?? (body.praca ? (await this.pracas.buscar(body.praca))?.id : null) ?? null;
    const { praca: _p, ...dados } = body;
    const criado = await this.drivers.adminCreate(user.id, dados as CriarMotoristaInput);
    const u = await this.prisma.user.findUnique({ where: { phone: body.phone }, select: { id: true } });
    if (u && praca) await this.pracas.definirPracaDoMotorista(u.id, praca);
    this.pracas.esquecerMotoristas();
    return criado;
  }

  @Post('excluir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exclui varios motoristas (cadastro, documentos, carros, carteira); corridas ficam no historico' })
  async excluirVarios(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }))) body: { ids: string[] },
  ) {
    for (const id of body.ids) await this.daMinhaCidade(user, id);
    const r = await this.drivers.adminDeleteMany(body.ids, user.id);
    this.pracas.esquecerMotoristas();
    return r;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui um motorista (cadastro, documentos, carros, carteira); corridas ficam no historico' })
  async excluir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.daMinhaCidade(user, id);
    const r = await this.drivers.adminDelete(id, user.id);
    this.pracas.esquecerMotoristas();
    return r;
  }

  @Get()
  @ApiOperation({ summary: 'Lista motoristas com filtros e progresso de documentos (por cidade)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationSchema.merge(listDriversSchema))) query: never,
    @Query('praca') praca?: string,
  ) {
    const filtro = await this.pracas.filtro(user, praca);
    const mapa = await this.pracas.mapaDeMotoristas();
    const todas = await this.pracas.listar();
    // Da cidade, e os que ainda nao tem cidade (cadastro novo sem posicao).
    const ids = filtro ? [...mapa.entries()].filter(([, p]) => p === filtro || p === null).map(([id]) => id) : null;
    return this.drivers.adminList(query as never, ids, (id) => {
      const p = mapa.get(id) ?? null;
      return { id: p, nome: p ? (todas.find((x) => x.id === p)?.nome ?? p) : null };
    });
  }

  @Get('active/map')
  @ApiOperation({ summary: 'Motoristas online com posicao atual (mapa do admin)' })
  async activeMap(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string) {
    return this.drivers.adminActiveDrivers(await this.pracas.idsDeMotoristas(await this.pracas.filtro(user, praca)));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do motorista com documentos e URLs assinadas' })
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const praca = await this.daMinhaCidade(user, id);
    const p = await this.pracas.buscar(praca);
    return { ...(await this.drivers.adminDetail(id)), praca, pracaNome: p?.nome ?? null };
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Aprova, reprova ou suspende o motorista' })
  async review(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reviewDriverSchema)) body: never,
  ) {
    await this.daMinhaCidade(user, id);
    return this.drivers.adminReview(id, user.id, body);
  }

  /** Operador so mexe em motorista da cidade dele (ou ainda sem cidade). */
  private async daMinhaCidade(user: AuthenticatedUser, driverId: string): Promise<string | null> {
    const praca = await this.pracas.pracaDoMotorista(driverId);
    const minha = await this.pracas.escopoDe(user.id);
    if (minha && praca && praca !== minha) {
      throw BusinessException.forbidden('Este motorista e de outra cidade. Voce so ve e mexe na sua cidade.');
    }
    return praca;
  }
}
