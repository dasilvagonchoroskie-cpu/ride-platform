import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LEGAL_VERSION, PRIVACY_MD, TERMS_MD } from './legal-content';

/**
 * Termos de Uso e Politica de Privacidade.
 *
 * Publico, sem login: o aplicativo precisa mostrar o texto ANTES de a
 * pessoa entrar, na tela de aceite obrigatorio.
 */
@ApiTags('Legal')
@Public()
@Controller('legal')
export class LegalController {
  @Get('terms')
  @ApiOperation({ summary: 'Termos de Uso vigentes' })
  terms() {
    return { version: LEGAL_VERSION, content: TERMS_MD };
  }

  @Get('privacy')
  @ApiOperation({ summary: 'Politica de Privacidade vigente' })
  privacy() {
    return { version: LEGAL_VERSION, content: PRIVACY_MD };
  }
}
