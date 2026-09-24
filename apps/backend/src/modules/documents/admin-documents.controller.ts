import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { listDocumentsSchema, paginationSchema, reviewDocumentSchema, UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DocumentsService } from './documents.service';

@ApiTags('Admin - Documentos')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/documents')
export class AdminDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Fila de documentos para analise' })
  list(@Query(new ZodValidationPipe(paginationSchema.merge(listDocumentsSchema))) query: never) {
    return this.documents.adminList(query as never);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Aprova ou reprova um documento' })
  review(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body(new ZodValidationPipe(reviewDocumentSchema)) body: never,
  ) {
    return this.documents.review(id, reviewerId, body);
  }
}
