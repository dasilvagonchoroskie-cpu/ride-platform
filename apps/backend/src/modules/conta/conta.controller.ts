import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PushService } from '../../integrations/notifications/push.service';
import { ContaService } from './conta.service';
import { escapar, pagina } from './pagina';

const excluirSchema = z.object({ confirmacao: z.literal('EXCLUIR') });
const pushSchema = z.object({ token: z.string().min(20).max(4096), deviceId: z.string().max(200).optional() });
const esquecerSchema = z.object({ token: z.string().max(4096).optional() });

@ApiTags('Conta')
@Controller('conta')
export class ContaController {
  constructor(
    private readonly conta: ContaService,
    private readonly push: PushService,
  ) {}

  @Post('push')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guarda o endereco de notificacao (Firebase) deste celular para esta conta' })
  async registrarPush(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(pushSchema)) body: { token: string; deviceId?: string },
  ) {
    await this.push.registrar(userId, body.token, body.deviceId);
    return { ok: true, pushLigado: this.push.ligado };
  }

  @Post('push/sair')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Saiu da conta: este celular para de receber os avisos dela' })
  async esquecerPush(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(esquecerSchema)) body: { token?: string }) {
    await this.push.esquecer(userId, body?.token ?? null);
    return { ok: true };
  }

  @Post('excluir')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exclui a propria conta (passageiro ou motorista). Corridas ficam no financeiro sem identificar a pessoa.' })
  excluir(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(excluirSchema)) _body: { confirmacao: 'EXCLUIR' }) {
    return this.conta.excluirMinhaConta(userId);
  }

  /** Pagina publica: como excluir a conta (link exigido pela Google Play). */
  @Public()
  @Get('exclusao')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Pagina publica para pedir a exclusao da conta' })
  paginaExclusao(@Res() res: Response): void {
    res.send(
      pagina(
        'Excluir conta',
        `<h1>Excluir sua conta da Fortaleza Mov</h1>
<div class="cartao">
<h2>Pelo aplicativo (na hora)</h2>
<ol>
<li><strong>Passageiro:</strong> abra o aplicativo Fortaleza Mov, toque em <strong>Conta</strong> e depois em <strong>Excluir minha conta</strong>.</li>
<li><strong>Motorista:</strong> abra o Fortaleza Mov Motorista, toque no <strong>Menu</strong>, em <strong>Cadastro</strong> e depois em <strong>Excluir minha conta</strong>.</li>
</ol>
</div>
<div class="cartao">
<h2>O que é apagado</h2>
<ul>
<li>Nome, telefone, e-mail, CPF, data de nascimento, foto e endereços salvos.</li>
<li>Motorista: também a CNH, as fotos dos documentos, os carros e a carteira (o saldo que sobrar é perdido; peça o saque antes).</li>
<li>As corridas já feitas ficam guardadas <strong>sem o seu nome</strong>, porque a empresa precisa delas para a contabilidade e a lei fiscal (até 5 anos).</li>
</ul>
</div>
<div class="cartao">
<h2>Sem acesso ao aplicativo? Peça aqui</h2>
<form method="post" action="exclusao">
<label for="contato">Telefone com DDD ou e-mail da conta</label>
<input id="contato" name="contato" required minlength="6" maxlength="120" placeholder="(64) 99999-1234 ou nome@email.com">
<label for="motivo">Motivo (opcional)</label>
<input id="motivo" name="motivo" maxlength="500">
<button type="submit">Pedir a exclusão da minha conta</button>
</form>
<p class="fraco">A Central confere e exclui a conta em até 7 dias. Se precisar confirmar que a conta é sua, entramos em contato pelo telefone ou e-mail informado.</p>
</div>`,
      ),
    );
  }

  @Public()
  @Post('exclusao')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Recebe o pedido de exclusao feito pela pagina publica' })
  async pedido(@Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const contato = typeof body?.contato === 'string' ? body.contato : '';
    const motivo = typeof body?.motivo === 'string' && body.motivo.trim() ? body.motivo.trim() : null;
    try {
      await this.conta.pedidoPelaInternet(contato, motivo);
      res.send(
        pagina(
          'Pedido recebido',
          `<h1>Pedido recebido</h1><div class="cartao"><p>Recebemos o pedido de exclusão da conta ligada a <strong>${escapar(
            contato.trim().slice(0, 120),
          )}</strong>. A Central confere e exclui em até 7 dias.</p><p>Se você ainda consegue entrar no aplicativo, dá para excluir na hora em <strong>Conta → Excluir minha conta</strong>.</p></div>`,
        ),
      );
    } catch (e) {
      res.status(400).send(
        pagina('Confira os dados', `<h1>Confira os dados</h1><div class="cartao"><p>${escapar((e as Error).message)}</p><p><a href="exclusao">Voltar</a></p></div>`),
      );
    }
  }
}
