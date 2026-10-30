import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FareFlag, RideStatus } from '@prisma/client';
import { generateNumericCode } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { gravarCategorias, lerCategorias } from '../rides/categorias';
import { PracasService } from '../pracas/pracas.service';
import { pracaDoPonto } from '../pracas/pracas.store';
import {
  CODIGO_ENTREGA,
  conferirCodigo,
  entregaNaCidade,
  gravarEntregaNaCidade,
  lerConfigDeEntregas,
  telefoneDeQuemRecebe,
  type EntregaNaCidade,
  type VeiculosDaEntrega,
} from './entregas.regras';

/** Tabela das entregas: so cria se faltar (nao mexe nas outras tabelas). */
const CRIAR_TABELA = `
CREATE TABLE IF NOT EXISTS "entregas" (
  "ride_id" UUID NOT NULL,
  "descricao" VARCHAR(200) NOT NULL,
  "destinatario_nome" VARCHAR(120) NOT NULL,
  "destinatario_telefone" VARCHAR(20) NOT NULL,
  "codigo" VARCHAR(4) NOT NULL,
  "veiculos" VARCHAR(10) NOT NULL DEFAULT 'TODOS',
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "coletada_em" TIMESTAMP(3),
  "entregue_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entregas_pkey" PRIMARY KEY ("ride_id"),
  CONSTRAINT "entregas_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

export interface DadosDaEntrega {
  descricao: string;
  destinatarioNome: string;
  destinatarioTelefone: string;
}

/** O que cada um ve da entrega. O codigo so o cliente (e a Central) ve. */
export type QuemVe = 'cliente' | 'motorista' | 'central';

@Injectable()
export class EntregasService implements OnModuleInit {
  private readonly logger = new Logger(EntregasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pracas: PracasService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(CRIAR_TABELA);
      await this.sementeDaTarifa();
    } catch (e) {
      this.logger.error(`Entregas: nao preparou a tabela ou a tarifa: ${(e as Error).message}`);
    }
  }

  /**
   * Categoria ENTREGA (tarifa propria), uma vez: desligada, com os valores
   * do Popular para o Evandro ajustar em Tarifas.
   */
  async sementeDaTarifa(): Promise<boolean> {
    let mudou = false;
    const lista = await lerCategorias(this.prisma);
    if (!lista.some((c) => c.codigo === CODIGO_ENTREGA)) {
      lista.push({
        codigo: CODIGO_ENTREGA,
        nome: 'Entrega',
        ativa: false,
        icone: 'entrega',
        descricao: 'Entrega de encomendas (liga em Entregas)',
        capacidade: 1,
        multiplicador: 1,
      });
      await gravarCategorias(this.prisma, lista);
      mudou = true;
    }
    const tem = await this.prisma.fareConfig.count({ where: { category: CODIGO_ENTREGA } });
    if (tem === 0) {
      const carro = await this.prisma.fareConfig.findMany({ where: { category: 'CARRO' } });
      for (const t of carro) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...valores } = t;
        await this.prisma.fareConfig.upsert({
          where: { category_flag: { category: CODIGO_ENTREGA, flag: t.flag as FareFlag } },
          create: { ...valores, category: CODIGO_ENTREGA },
          update: {},
        });
      }
      mudou = carro.length > 0 || mudou;
    }
    if (mudou) this.logger.log('Entregas: tarifa propria "Entrega" criada (desligada em todas as cidades).');
    return mudou;
  }

  // ------------------------------------------------------------------
  // Liga e desliga por cidade
  // ------------------------------------------------------------------

  async naCidade(praca: string | null | undefined): Promise<EntregaNaCidade> {
    return entregaNaCidade(await lerConfigDeEntregas(this.prisma), praca);
  }

  /** O app do cliente pergunta se mostra o botao "Entrega" (no ponto de coleta). */
  async disponivel(ponto: { latitude: number; longitude: number }) {
    const praca = await this.pracas.doPonto(ponto);
    const c = await this.naCidade(praca?.id);
    return { ligada: c.ligada, veiculos: c.veiculos, cidade: praca?.nome ?? null, praca: praca?.id ?? null };
  }

  /** Recusa o pedido se a entrega nao esta ligada na cidade da coleta. */
  async exigirLigada(ponto: { latitude: number; longitude: number }): Promise<{ praca: string | null; veiculos: VeiculosDaEntrega }> {
    const d = await this.disponivel(ponto);
    if (!d.ligada) throw BusinessException.validation('Entrega ainda não está disponível nesta cidade.');
    return { praca: d.praca, veiculos: d.veiculos };
  }

  async lerConfig() {
    const [cfg, pracas] = await Promise.all([lerConfigDeEntregas(this.prisma), this.pracas.listar()]);
    return {
      cidades: pracas.map((p) => ({ praca: p.id, nome: p.nome, uf: p.uf, ...entregaNaCidade(cfg, p.id) })),
    };
  }

  async gravarConfig(praca: string, c: EntregaNaCidade, adminId: string) {
    const p = await this.pracas.buscar(praca);
    if (!p) throw BusinessException.notFound('Cidade nao encontrada.');
    await gravarEntregaNaCidade(this.prisma, p.id, c, adminId);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'ENTREGAS_CONFIG',
        entity: 'praca',
        entityId: null,
        after: { praca: p.id, ...c } as never,
      },
    });
    return this.lerConfig();
  }

  // ------------------------------------------------------------------
  // Pedido, coleta e entrega
  // ------------------------------------------------------------------

  /** Grava a entrega junto com a corrida (mesma transacao). Devolve o codigo. */
  async criar(
    tx: Pick<PrismaService, 'entrega'>,
    rideId: string,
    dados: DadosDaEntrega,
    veiculos: VeiculosDaEntrega,
  ): Promise<string> {
    const codigo = generateNumericCode(4);
    await tx.entrega.create({
      data: {
        rideId,
        descricao: dados.descricao.trim().slice(0, 200),
        destinatarioNome: dados.destinatarioNome.trim().slice(0, 120),
        destinatarioTelefone: telefoneDeQuemRecebe(dados.destinatarioTelefone).slice(0, 20),
        codigo,
        veiculos,
      },
    });
    return codigo;
  }

  async daCorrida(rideId: string) {
    return this.prisma.entrega.findUnique({ where: { rideId } });
  }

  /** Motorista confirmou a coleta (o "iniciar" da corrida). */
  async coletou(rideId: string): Promise<void> {
    await this.prisma.entrega.updateMany({ where: { rideId, coletadaEm: null }, data: { coletadaEm: new Date() } });
  }

  /**
   * Antes de encerrar a corrida: confere o codigo. Errado conta tentativa e
   * recusa (o motorista ve o motivo). Certo: marca entregue.
   */
  async conferirAoEntregar(rideId: string, digitado: string | null | undefined): Promise<void> {
    const e = await this.daCorrida(rideId);
    if (!e) return; // nao e entrega
    const r = conferirCodigo(e, digitado);
    if (!r.ok) {
      if ((digitado ?? '').replace(/\D/g, '').length === 4 && e.tentativas < 5) {
        await this.prisma.entrega.update({ where: { rideId }, data: { tentativas: { increment: 1 } } });
      }
      throw BusinessException.validation(r.motivo);
    }
    await this.prisma.entrega.update({ where: { rideId }, data: { entregueEm: new Date() } });
  }

  /**
   * Central: depois de 5 codigos errados a entrega trava. A Central confere
   * com quem recebe (por telefone) e libera mais 5 tentativas.
   */
  async liberarTentativas(rideId: string, adminId: string, pracaDoOperador: string | null): Promise<void> {
    const r = await this.prisma.ride.findUnique({ where: { id: rideId }, select: { pickupLat: true, pickupLng: true, status: true } });
    const e = r ? await this.daCorrida(rideId) : null;
    if (!r || !e) throw BusinessException.notFound('Entrega nao encontrada.');
    if (pracaDoOperador) {
      const p = pracaDoPonto(await this.pracas.listar(), { latitude: r.pickupLat, longitude: r.pickupLng });
      if (p?.id !== pracaDoOperador) throw BusinessException.forbidden('Esta entrega e de outra cidade.');
    }
    await this.prisma.entrega.update({ where: { rideId }, data: { tentativas: 0 } });
    await this.prisma.auditLog.create({
      data: { actorId: adminId, actorRole: 'ADMIN', action: 'ENTREGA_LIBEROU_CODIGO', entity: 'ride', entityId: rideId },
    });
  }

  /** Para a resposta da corrida (cliente, motorista ou Central). */
  publico(
    e: { descricao: string; destinatarioNome: string; destinatarioTelefone: string; codigo: string; veiculos: string; tentativas: number; coletadaEm: Date | null; entregueEm: Date | null } | null,
    quem: QuemVe,
  ) {
    if (!e) return null;
    return {
      descricao: e.descricao,
      destinatarioNome: e.destinatarioNome,
      destinatarioTelefone: e.destinatarioTelefone,
      veiculos: e.veiculos,
      coletadaEm: e.coletadaEm?.toISOString() ?? null,
      entregueEm: e.entregueEm?.toISOString() ?? null,
      // O motorista NUNCA recebe o codigo: ele pede a quem recebe.
      ...(quem === 'motorista' ? {} : { codigo: e.codigo }),
      ...(quem === 'central' ? { tentativas: e.tentativas } : {}),
    };
  }

  // ------------------------------------------------------------------
  // Central: pedidos por cidade
  // ------------------------------------------------------------------

  async listarParaCentral(praca: string | null, status?: string) {
    const lista = await this.prisma.ride.findMany({
      where: {
        category: CODIGO_ENTREGA,
        ...(status === 'abertas'
          ? { status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING, RideStatus.DRIVER_ASSIGNED, RideStatus.DRIVER_ARRIVING, RideStatus.DRIVER_WAITING, RideStatus.IN_PROGRESS] } }
          : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: {
        entrega: true,
        passenger: { select: { name: true, phone: true } },
        driver: { select: { user: { select: { name: true, phone: true } } } },
        vehicle: { select: { plate: true, model: true, category: true } },
      },
    });
    const todas = await this.pracas.listar();
    const itens = lista
      .map((r) => ({ r, p: pracaDoPonto(todas, { latitude: r.pickupLat, longitude: r.pickupLng })?.id ?? null }))
      .filter(({ p }) => !praca || p === praca)
      .map(({ r, p }) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        praca: p,
        coleta: r.pickupAddress,
        entrega: r.dropoffAddress,
        valorCents: r.finalFareCents ?? r.estimatedFareCents,
        comissaoCents: r.commissionCents,
        cliente: { nome: r.passenger.name, telefone: r.passenger.phone },
        motorista: r.driver ? { nome: r.driver.user.name, telefone: r.driver.user.phone } : null,
        veiculo: r.vehicle ? `${r.vehicle.model} · ${r.vehicle.plate}` : null,
        pedidaEm: r.requestedAt.toISOString(),
        detalhe: this.publico(r.entrega, 'central'),
      }));
    return { itens };
  }
}
