import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  });

export type CriarMotoristaInput = z.infer<typeof criarMotoristaSchema>;

@ApiTags('Admin - Motoristas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra o motorista pela Central (dados, CNH e veiculo); ja aprovado se pedido' })
  criar(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(criarMotoristaSchema)) body: CriarMotoristaInput) {
    return this.drivers.adminCreate(adminId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Lista motoristas com filtros e progresso de documentos' })
  list(@Query(new ZodValidationPipe(paginationSchema.merge(listDriversSchema))) query: never) {
    return this.drivers.adminList(query as never);
  }

  @Get('active/map')
  @ApiOperation({ summary: 'Motoristas online com posicao atual (mapa do admin)' })
  activeMap() {
    return this.drivers.adminActiveDrivers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do motorista com documentos e URLs assinadas' })
  detail(@Param('id') id: string) {
    return this.drivers.adminDetail(id);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Aprova, reprova ou suspende o motorista' })
  review(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body(new ZodValidationPipe(reviewDriverSchema)) body: never,
  ) {
    return this.drivers.adminReview(id, reviewerId, body);
  }
}
