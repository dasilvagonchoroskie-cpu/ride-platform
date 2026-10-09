import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { UserRole } from '@ride/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracasService } from '../pracas/pracas.service';
import { ArquivosService } from './arquivos.service';

const fotoSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dados: z.string().min(16).max(3_000_000),
});

const documentoSchema = fotoSchema.extend({
  type: z.nativeEnum(DocumentType),
});

@ApiTags('Fotos')
@ApiBearerAuth()
@Controller()
export class ArquivosController {
  constructor(
    private readonly arquivos: ArquivosService,
    private readonly pracas: PracasService,
  ) {}

  @Post('auth/foto')
  @ApiOperation({ summary: 'Troca a foto de perfil (passageiro ou motorista)' })
  foto(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(fotoSchema)) body: { mime: string; dados: string }) {
    return this.arquivos.fotoDePerfil(userId, body.mime, body.dados);
  }

  @Post('documents/foto')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Foto de documento do motorista (fica pendente para a Central conferir)' })
  documento(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(documentoSchema)) body: { type: DocumentType; mime: string; dados: string },
  ) {
    // O cadastro de motorista pode ter acabado de ser feito: o login ainda
    // nao traz o numero do motorista, entao ele e buscado pelo usuario.
    return this.arquivos.fotoDeDocumento(user.id, body.type, body.mime, body.dados);
  }

  @Post('admin/drivers/:id/foto')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'A Central poe ou troca a foto do motorista (ja aprovada)' })
  async fotoPelaCentral(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(fotoSchema)) body: { mime: string; dados: string },
  ) {
    // Operador de uma cidade so mexe nos motoristas dela (ou ainda sem cidade).
    const praca = await this.pracas.pracaDoMotorista(id);
    const minha = await this.pracas.escopoDe(user.id);
    if (minha && praca && praca !== minha) {
      throw BusinessException.forbidden('Este motorista e de outra cidade. Voce so ve e mexe na sua cidade.');
    }
    return this.arquivos.fotoDoMotoristaPelaCentral(id, user.id, body.mime, body.dados);
  }

  @Get('arquivos/:id')
  @ApiOperation({ summary: 'Mostra uma foto' })
  async ler(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const a = await this.arquivos.ler(id, { id: user.id, role: user.role as never });
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(a.dados));
  }
}
