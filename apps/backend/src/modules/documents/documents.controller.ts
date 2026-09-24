import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { confirmDocumentUploadSchema, requestDocumentUploadSchema, UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DocumentsService } from './documents.service';

@ApiTags('Documentos do motorista')
@ApiBearerAuth()
@Roles(UserRole.DRIVER, UserRole.ADMIN)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Passo 1: gera URL assinada para envio do documento' })
  requestUpload(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(requestDocumentUploadSchema)) body: never,
  ) {
    return this.documents.requestUpload(userId, body);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Passo 2: confirma o envio do documento' })
  confirm(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(confirmDocumentUploadSchema)) body: { documentId: string; checksum?: string },
  ) {
    return this.documents.confirmUpload(userId, body.documentId, body.checksum);
  }

  @Get('me')
  @ApiOperation({ summary: 'Lista meus documentos com URLs assinadas e progresso' })
  listMine(@CurrentUser('id') userId: string) {
    return this.documents.listMine(userId);
  }

  @Get('me/required')
  @ApiOperation({ summary: 'Checklist de documentos obrigatorios' })
  required(@CurrentUser('id') userId: string) {
    return this.documents.requiredChecklist(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove documento reprovado para reenvio' })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.documents.removeMine(userId, id);
  }
}
