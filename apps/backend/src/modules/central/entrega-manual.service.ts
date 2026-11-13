import { Injectable } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { UserRole } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { EntregaCentralInput, EntregaManualInput } from '../comercio/comercio.regras';
import { PracasService } from '../pracas/pracas.service';
import { ComercioService } from '../comercio/comercio.service';
import { RidesService } from '../rides/rides.service';
import { CentralService } from './central.service';

/**
 * Entrega lancada manualmente pelo motorista (12/11/2026): o comerciante pediu
 * direto a ele (na rua, por telefone). E o MESMO pedido da loja
 * (`ComercioService.criarEntrega`): mesmas portas, mesmo preco oficial, mesma
 * chave anti-duplicidade, mesmo despacho e acompanhamento. Muda so a origem
 * (MOTORISTA, com quem lancou e quando) e que a corrida ja nasce entregue a
 * este motorista, como na corrida manual de passageiro.
 *
 * Nada aqui liga o Comercio, aprova loja ou mexe em permissao da cidade: se
 * qualquer porta estiver fechada, o servidor recusa.
 */
@Injectable()
export class EntregaManualService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comercio: ComercioService,
    private readonly central: CentralService,
    private readonly rides: RidesService,
    private readonly pracas: PracasService,
  ) {}

  async lancar(userId: string, input: EntregaManualInput) {
    const m = await this.comercio.motoristaAprovado(userId);
    if (!m.isOnline) throw BusinessException.validation('Fique online para lançar uma entrega.');
    const c = await this.comercio.comercioParaMotorista(m.praca, input.comercioId);
    if (c.userId === userId) {
      throw BusinessException.forbidden('Esta é a sua própria conta de estabelecimento. Use o aplicativo Comércio.');
    }
    // As mesmas tres portas da loja (e-mail confirmado, aprovada, chave geral). As outras
    // duas (Entrega ligada na cidade e veiculo aceito) ficam dentro do pedido oficial.
    await this.comercio.portasDe(c);
    const veiculo = await this.comercio.veiculoDoMotorista(m.id);

    const { comercioId: _comercioId, ...pedido } = input;
    const r = await this.comercio.criarEntrega(
      c,
      { ...pedido, veiculo },
      { atorId: userId, atorRole: UserRole.DRIVER, origem: 'MOTORISTA', motoristaId: m.id },
    );

    const registro = await this.prisma.comercioPedido.findUnique({
      where: { rideId: r.rideId },
      select: { lancadoPor: true, origem: true, ride: { select: { code: true, status: true, driverId: true } } },
    });
    if (!registro) throw BusinessException.conflict('Não foi possível confirmar o registro da entrega. Confira o histórico.');
    if (r.repetido) {
      // A mesma chave de novo (queda de rede): so devolve o que e DESTE motorista.
      if (registro.origem !== 'MOTORISTA' || registro.lancadoPor !== m.id) {
        throw BusinessException.conflict('Esta chave de pedido já foi usada em outra entrega.');
      }
      if (registro.ride.driverId === m.id) return { rideId: r.rideId, codigo: registro.ride.code, repetido: true };
      if (registro.ride.status !== RideStatus.SEARCHING) {
        throw BusinessException.conflict('Esta entrega já foi encerrada ou atendida. Confira o histórico.');
      }
    } else {
      await this.prisma.rideStatusHistory.create({
        data: {
          rideId: r.rideId,
          status: RideStatus.REQUESTED,
          actorId: userId,
          actorRole: UserRole.DRIVER,
          note: `Entrega lançada manualmente pelo motorista para ${c.nomeFantasia}.`,
        },
      });
    }

    try {
      await this.central.atribuir(userId, r.rideId, m.id);
      await this.rides.aceitar(m.id, r.rideId);
    } catch (erro) {
      // Nao deixa a entrega solta procurando outro motorista.
      await this.prisma.ride.update({
        where: { id: r.rideId },
        data: { status: RideStatus.CANCELLED_BY_SYSTEM, cancelledAt: new Date(), driverId: null, vehicleId: null },
      });
      throw erro;
    }
    return { rideId: r.rideId, codigo: registro.ride.code, repetido: r.repetido };
  }

  /**
   * Entrega lancada pela Central (13/11/2026): o comerciante ligou ou chegou na
   * Central. E o MESMO pedido da loja (`criarEntrega`): mesmas portas, preco
   * oficial, chave anti-duplicidade e acompanhamento; muda so a origem (CENTRAL).
   * Sem motorista escolhido, o despacho automatico procura (como no pedido da
   * loja); com motorista, a entrega e enviada a ele, que aceita no aplicativo
   * (como na corrida manual da Central). Nada aqui liga o Comercio nem muda
   * permissao, tarifa ou comissao: se alguma porta estiver fechada, o servidor recusa.
   */
  async lancarPelaCentral(user: AuthenticatedUser, input: EntregaCentralInput) {
    const c = await this.comercio.lojaParaCentral(input.comercioId);
    await this.pracas.exigirAcesso(user, await this.comercio.pracaDaLoja(c));
    if (input.motoristaId) await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(input.motoristaId));
    await this.comercio.portasDe(c);

    const { comercioId: _comercioId, motoristaId, ...pedido } = input;
    const r = await this.comercio.criarEntrega(c, pedido, { atorId: user.id, atorRole: UserRole.ADMIN, origem: 'CENTRAL' });

    const registro = await this.prisma.comercioPedido.findUnique({
      where: { rideId: r.rideId },
      select: { origem: true, ride: { select: { code: true, status: true } } },
    });
    if (!registro) throw BusinessException.conflict('Não foi possível confirmar o registro da entrega. Confira o histórico.');
    if (r.repetido) {
      if (registro.origem !== 'CENTRAL') throw BusinessException.conflict('Esta chave de pedido já foi usada em outra entrega.');
      return { rideId: r.rideId, codigo: registro.ride.code, repetido: true };
    }
    await this.prisma.rideStatusHistory.create({
      data: {
        rideId: r.rideId,
        status: RideStatus.REQUESTED,
        actorId: user.id,
        actorRole: UserRole.ADMIN,
        note: `Entrega lançada pela Central para ${c.nomeFantasia}.`,
      },
    });
    if (motoristaId) {
      try {
        await this.central.atribuir(user.id, r.rideId, motoristaId);
      } catch (erro) {
        // Nao deixa a entrega solta procurando outro motorista quando a Central escolheu um.
        await this.prisma.ride.update({
          where: { id: r.rideId },
          data: { status: RideStatus.CANCELLED_BY_SYSTEM, cancelledAt: new Date(), driverId: null, vehicleId: null },
        });
        throw erro;
      }
    }
    return { rideId: r.rideId, codigo: registro.ride.code, repetido: false };
  }
}
