import { Injectable } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { UserRole, UserStatus } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  descricaoParaMotorista,
  digitos,
  enderecoPorExtenso,
  type CotarAvulsaInput,
  type EntregaAvulsaInput,
  type EntregaCentralInput,
  type EntregaManualInput,
  type EstabelecimentoAvulso,
} from '../comercio/comercio.regras';
import { telefoneDeQuemRecebe } from '../entregas/entregas.regras';
import { PracasService } from '../pracas/pracas.service';
import { ComercioService } from '../comercio/comercio.service';
import { RidesService } from '../rides/rides.service';
import { CentralService } from './central.service';

const ACAO_AVULSA = 'ENTREGA_AVULSA_LANCADA_PELA_CENTRAL';
const STATUS_ABERTOS = ['SCHEDULED', 'REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'];
/** Mesmo teto por estabelecimento do pedido da loja: nao e uma enxurrada para os motoristas. */
const MAX_ABERTAS_AVULSAS = 20;
/** Quanto tempo a chave anti-duplicidade da entrega avulsa vale (o toque repetido por queda de rede e imediato). */
const JANELA_DA_CHAVE_MS = 7 * 24 * 60 * 60 * 1000;

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

  // ---------------------------------------------------------------------------
  // Entrega AVULSA (13/11/2026): estabelecimento que NAO esta cadastrado no Comercio.
  // ---------------------------------------------------------------------------

  /**
   * Preco oficial da coleta avulsa (nao cria nada): o mesmo calculo da entrega da
   * loja (`rides.estimar`, categoria ENTREGA), com a coleta no endereco digitado.
   * Valem as mesmas portas: chave geral do Comercio, Entrega ligada na cidade e
   * veiculo aceito, tudo no servidor.
   */
  async cotarAvulsa(user: AuthenticatedUser, input: CotarAvulsaInput) {
    await this.exigirAvulsa(user, input.estabelecimento);
    const pickup = this.coletaAvulsa(input.estabelecimento);
    const dropoff = this.destinoAvulso(input.destino);
    const orc = await this.rides.estimar(
      { pickup, dropoff, category: 'ENTREGA', ...(input.cotacao ? { cotacao: input.cotacao } : {}) } as never,
    );
    return {
      coleta: { endereco: pickup.address, alternativa: false },
      entrega: { endereco: dropoff.address },
      totalDeEntregas: 1,
      distanciaMetros: orc.distanceMeters,
      duracaoSegundos: orc.durationSeconds,
      opcoes: (orc.opcoesEntrega ?? []).map((o) => ({ veiculo: o.veiculo, nome: o.nome, valorCents: o.estimatedFareCents })),
      cotacao: orc.cotacao,
    };
  }

  /**
   * Lanca a entrega de um estabelecimento sem cadastro. E o MESMO pedido oficial
   * (`rides.pedir` com `entrega`): preco, despacho, codigo de entrega e
   * acompanhamento iguais; so nao ha loja (nem pedido do Comercio) por tras. Quem
   * "pede" no motor e uma conta de passageiro criada/reaproveitada pelo telefone de
   * contato (como a corrida manual da Central). A chave do pedido fica na
   * auditoria, gravada na MESMA transacao da corrida: o toque repetido devolve a
   * mesma entrega. Nada aqui liga entrega, tarifa, comissao ou carteira.
   */
  async lancarAvulsa(user: AuthenticatedUser, input: EntregaAvulsaInput) {
    const ja = await this.avulsaDaChave(user.id, input.chave);
    if (ja) return ja;

    const est = input.estabelecimento;
    await this.exigirAvulsa(user, est);
    if (input.motoristaId) await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(input.motoristaId));
    const passageiro = await this.passageiroDoContato(est);

    const abertas = await this.prisma.ride.count({ where: { passengerId: passageiro.id, status: { in: STATUS_ABERTOS as never } } });
    if (abertas >= MAX_ABERTAS_AVULSAS) {
      throw BusinessException.conflict(`Este contato já tem ${MAX_ABERTAS_AVULSAS} entregas em andamento. Aguarde alguma terminar ou cancele uma antes de lançar outra.`);
    }

    const pickup = this.coletaAvulsa(est);
    const dropoff = this.destinoAvulso(input.destino);
    if (input.valorEsperadoCents != null) {
      // Honestidade do preco: a Central confirmou um valor; se o oficial mudou, nao cria com outro.
      const orc = await this.rides.estimar(
        { pickup, dropoff, category: 'ENTREGA', ...(input.cotacao ? { cotacao: input.cotacao } : {}) } as never,
      );
      const opcao = (orc.opcoesEntrega ?? []).find((o) => o.veiculo === input.veiculo);
      if (!opcao) throw BusinessException.validation('Este veículo não está disponível agora. Consulte o preço de novo.');
      if (opcao.estimatedFareCents !== input.valorEsperadoCents) {
        const reais = (v: number) => `R$ ${(v / 100).toFixed(2).replace('.', ',')}`;
        throw BusinessException.conflict(`O preço mudou: era ${reais(input.valorEsperadoCents)} e agora é ${reais(opcao.estimatedFareCents)}. Consulte o preço de novo.`);
      }
    }

    const trava = `${user.id}:${input.chave}`;
    if (this.avulsasEmAndamento.has(trava)) throw BusinessException.conflict('Este pedido já está sendo enviado. Aguarde um instante.');
    this.avulsasEmAndamento.add(trava);
    let rideId: string;
    try {
      const descricao = descricaoParaMotorista({
        rotulo: 'AVULSO',
        nome: est.nome,
        telefone: est.telefone,
        encomenda: input.encomenda.descricao,
        observacoes: input.encomenda.observacoes,
        referencia: input.destino.referencia,
      });
      const corrida = await this.rides.pedir(
        passageiro.id,
        {
          pickup,
          dropoff,
          paymentMethodType: 'CASH',
          ...(input.cotacao ? { cotacao: input.cotacao } : {}),
          entrega: {
            descricao,
            destinatarioNome: input.destinatario.nome,
            destinatarioTelefone: telefoneDeQuemRecebe(input.destinatario.telefone),
            veiculo: input.veiculo,
          },
        } as never,
        {
          varias: true,
          aoCriar: async (tx, id) => {
            await tx.auditLog.create({
              data: {
                actorId: user.id,
                actorRole: UserRole.ADMIN,
                action: ACAO_AVULSA,
                entity: 'ride',
                entityId: id,
                after: {
                  chave: input.chave,
                  origem: 'CENTRAL_AVULSA',
                  estabelecimento: { nome: est.nome, telefone: digitos(est.telefone) },
                  veiculo: input.veiculo,
                  motoristaEscolhido: !!input.motoristaId,
                } as never,
              },
            });
          },
        },
      );
      rideId = (corrida as unknown as { ride: { id: string } }).ride.id;
    } finally {
      this.avulsasEmAndamento.delete(trava);
    }

    await this.prisma.rideStatusHistory.create({
      data: {
        rideId,
        status: RideStatus.REQUESTED,
        actorId: user.id,
        actorRole: UserRole.ADMIN,
        note: `Entrega avulsa lançada pela Central para ${est.nome} (sem cadastro).`.slice(0, 300),
      },
    });
    if (input.motoristaId) {
      try {
        await this.central.atribuir(user.id, rideId, input.motoristaId);
      } catch (erro) {
        // Nao deixa a entrega solta procurando outro motorista quando a Central escolheu um.
        await this.prisma.ride.update({
          where: { id: rideId },
          data: { status: RideStatus.CANCELLED_BY_SYSTEM, cancelledAt: new Date(), driverId: null, vehicleId: null },
        });
        throw erro;
      }
    }
    const criada = await this.prisma.ride.findUnique({ where: { id: rideId }, select: { code: true } });
    return { rideId, codigo: criada?.code ?? '', repetido: false };
  }

  private readonly avulsasEmAndamento = new Set<string>();

  /** As portas da entrega avulsa: chave geral do Comercio e a cidade da coleta (operador de cidade so mexe na dele). */
  private async exigirAvulsa(user: AuthenticatedUser, est: EstabelecimentoAvulso): Promise<void> {
    await this.comercio.exigirComercioAtivo();
    await this.pracas.exigirAcesso(user, await this.comercio.pracaDoLocal(est.coleta));
  }

  private coletaAvulsa(est: EstabelecimentoAvulso) {
    return { address: est.coleta.address, latitude: est.coleta.latitude, longitude: est.coleta.longitude, placeId: est.coleta.placeId };
  }

  private destinoAvulso(d: EntregaAvulsaInput['destino']) {
    return { address: enderecoPorExtenso(d), latitude: d.latitude, longitude: d.longitude, placeId: d.placeId };
  }

  /** A entrega que esta chave ja criou (toque repetido por queda de rede), so do mesmo operador. */
  private async avulsaDaChave(operadorId: string, chave: string) {
    const a = await this.prisma.auditLog.findFirst({
      where: {
        actorId: operadorId,
        action: ACAO_AVULSA,
        entity: 'ride',
        createdAt: { gte: new Date(Date.now() - JANELA_DA_CHAVE_MS) },
        after: { path: ['chave'], equals: chave },
      },
      select: { entityId: true },
    });
    if (!a?.entityId) return null;
    const r = await this.prisma.ride.findUnique({ where: { id: a.entityId }, select: { code: true } });
    return r ? { rideId: a.entityId, codigo: r.code, repetido: true } : null;
  }

  /** O passageiro "dono" da entrega: a conta do telefone de contato (cria uma se nao houver, marcada como da Central). */
  private async passageiroDoContato(est: EstabelecimentoAvulso) {
    const telefone = '+55' + digitos(est.telefone).replace(/^55(?=\d{10,11}$)/, '');
    if (!/^\+55\d{10,11}$/.test(telefone)) throw BusinessException.validation('Telefone do estabelecimento inválido (DDD + número).');
    const existente = await this.prisma.user.findFirst({ where: { phone: telefone, deletedAt: null } });
    if (existente?.status === UserStatus.BLOCKED) throw BusinessException.validation('Este telefone está bloqueado.');
    if (existente) return existente;
    return this.prisma.user.create({
      data: {
        name: est.nome.trim(),
        phone: telefone,
        role: UserRole.PASSENGER,
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: null,
        metadata: { criadoPelaCentral: true, estabelecimentoAvulso: true } as never,
      },
    });
  }
}
