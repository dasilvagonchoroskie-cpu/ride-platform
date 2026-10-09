import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { listDocumentsSchema, paginationSchema, reviewDocumentSchema, UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DocumentsService } from './documents.service';

@ApiTags('Admin - Documentos')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/documents')
export class AdminDocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly pracas: PracasService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Fila de documentos para analise (todas as cidades: so o dono)' })
  list(@Query(new ZodValidationPipe(paginationSchema.merge(listDocumentsSchema))) query: never) {
    return this.documents.adminList(query as never);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Aprova ou reprova um documento' })
  async review(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reviewDocumentSchema)) body: never,
  ) {
    const doc = await this.prisma.driverDocument.findUnique({ where: { id }, select: { driverId: true } });
    if (doc) {
      const praca = await this.pracas.pracaDoMotorista(doc.driverId);
      const minha = await this.pracas.escopoDe(user.id);
      if (minha && praca && praca !== minha) await this.pracas.exigirAcesso(user, praca);
    }
    return this.documents.review(id, user.id, body);
  }
}
