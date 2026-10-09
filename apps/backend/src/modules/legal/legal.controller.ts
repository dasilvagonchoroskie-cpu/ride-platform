import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LEGAL_VERSION, PRIVACY_MD, TERMS_MD } from './legal-content';
import { markdownParaHtml, pagina } from '../conta/pagina';

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

  /** Pagina de internet da politica (endereco que vai na Google Play). */
  @Get('privacidade')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Politica de Privacidade em pagina de internet' })
  privacidade(@Res() res: Response): void {
    res.send(
      pagina(
        'Política de Privacidade',
        markdownParaHtml(PRIVACY_MD) +
          '<div class="cartao"><h2>Excluir a sua conta</h2><p>Pelo aplicativo, em Conta → Excluir minha conta, ou pela página <a href="../conta/exclusao">Excluir conta</a>.</p></div>',
      ),
    );
  }

  @Get('termos')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Termos de Uso em pagina de internet' })
  termos(@Res() res: Response): void {
    res.send(pagina('Termos de Uso', markdownParaHtml(TERMS_MD)));
  }
}
