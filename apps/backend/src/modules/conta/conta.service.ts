import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@ride/shared';
import { UserRole } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../../integrations/notifications/notification.service';
import { AppConfigService } from '../../config/app-config.service';
import { CentralService } from '../central/central.service';
import { DriversService } from '../drivers/drivers.service';

/**
 * Excluir a propria conta (exigencia da Google Play para app que cria
 * conta; Evandro aprovou em 09/10/2026).
 *
 * Pelo aplicativo: na hora. Motorista: cadastro, CNH, fotos, carros,
 * carteira (o saldo se perde) e extrato. Passageiro: nome, telefone,
 * e-mail, CPF, foto e enderecos. As corridas ja feitas ficam no financeiro,
 * sem identificar a pessoa (obrigacao fiscal).
 *
 * Pela pagina da internet: a pessoa deixa o telefone ou e-mail e a Central
 * recebe o pedido por e-mail para atender.
 */
@Injectable()
export class ContaService {
  private readonly logger = new Logger(ContaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: DriversService,
    private readonly central: CentralService,
    private readonly avisos: NotificationService,
    private readonly config: AppConfigService,
  ) {}

  async excluirMinhaConta(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deletedAt: true, driver: { select: { id: true } } },
    });
    if (!u || u.deletedAt) throw BusinessException.notFound('Conta nao encontrada (ja excluida?).');
    if (u.role === UserRole.ADMIN) throw BusinessException.forbidden('A conta da Central nao pode ser excluida pelo aplicativo.');

    let resultado = 'APAGADO';
    // Motorista: sai o cadastro de motorista (e a conta, se nao usar o app do passageiro).
    if (u.driver) {
      const r = await this.drivers.adminDelete(u.driver.id, userId, UserRole.DRIVER);
      resultado = r.resultado;
    }
    // Sobrou a conta de passageiro (ou so era passageiro): sai tambem.
    const ainda = await this.prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (ainda && !ainda.deletedAt) {
      const r = await this.central.excluirPassageiro(userId, userId, UserRole.PASSENGER);
      resultado = r.resultado;
    }
    this.logger.log(`Conta ${userId} excluida pela propria pessoa (${resultado}).`);
    return { ok: true, resultado };
  }

  /** Pedido feito pela pagina da internet: vai por e-mail para a Central. */
  async pedidoPelaInternet(contato: string, motivo: string | null): Promise<void> {
    const c = contato.trim().slice(0, 120);
    if (c.length < 6) throw BusinessException.validation('Informe o telefone com DDD ou o e-mail da conta.');
    await this.prisma.auditLog.create({
      data: {
        action: 'PEDIDO_EXCLUSAO_CONTA',
        entity: 'user',
        entityId: null,
        after: { contato: c, motivo: motivo?.slice(0, 500) ?? null } as never,
      },
    });
    const destino = this.config.mail.remetente || 'fortalezadigitalsecurity@gmail.com';
    await this.avisos
      .send({
        userId: 'sistema',
        channel: NotificationChannel.EMAIL,
        to: destino,
        title: 'Fortaleza Mov: pedido de exclusão de conta',
        body:
          `Chegou um pedido de exclusão de conta pela página da internet.\n\n` +
          `Telefone ou e-mail informado: ${c}\n` +
          (motivo ? `Motivo: ${motivo.slice(0, 500)}\n` : '') +
          `\nConfira quem é na Central (Passageiros ou Motoristas) e exclua a conta em até 7 dias. ` +
          `Se não achar a conta, responda para o contato informado.`,
      })
      .catch((e) => this.logger.warn(`Pedido de exclusao sem e-mail: ${(e as Error).message}`));
    this.logger.log(`Pedido de exclusao de conta pela internet: ${c.replace(/.(?=.{4})/g, '*')}`);
  }
}
