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
  CODIGO_ENTREGA_MOTO,
  conferirCodigo,
  MAX_TENTATIVAS_CODIGO,
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

/**
 * Varias entregas num pedido so (13/11/2026): a ultima entrega e a da tabela
 * "entregas" (como sempre); as anteriores ficam aqui, na ordem da rota, cada uma
 * com quem recebe e o proprio codigo de 4 numeros.
 */
const CRIAR_TABELA_PARADAS = `
CREATE TABLE IF NOT EXISTS "entrega_paradas" (
  "ride_id" UUID NOT NULL,
  "sequencia" INTEGER NOT NULL,
  "descricao" VARCHAR(200) NOT NULL,
  "destinatario_nome" VARCHAR(120) NOT NULL,
  "destinatario_telefone" VARCHAR(20) NOT NULL,
  "codigo" VARCHAR(4) NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "entregue_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entrega_paradas_pkey" PRIMARY KEY ("ride_id", "sequencia"),
  CONSTRAINT "entrega_paradas_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

/** Maximo de entregas num pedido (as paradas no caminho + a ultima). */
export const MAX_ENTREGAS_POR_PEDIDO = 5;

export interface ParadaDaEntrega {
  sequencia: number;
  descricao: string;
  destinatarioNome: string;
  destinatarioTelefone: string;
  codigo: string;
  tentativas: number;
  entregueEm: Date | null;
}

type ExecutorSql = { $executeRawUnsafe: (consulta: string, ...valores: unknown[]) => Promise<number> };

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
      // RLS ja na criacao (ver Comercio): o ajuste do PrismaService roda antes desta tabela existir.
      await this.prisma.$executeRawUnsafe('ALTER TABLE "entregas" ENABLE ROW LEVEL SECURITY');
      await this.prisma.$executeRawUnsafe(CRIAR_TABELA_PARADAS);
      await this.prisma.$executeRawUnsafe('ALTER TABLE "entrega_paradas" ENABLE ROW LEVEL SECURITY');
      await this.sementeDaTarifa();
    } catch (e) {
      this.logger.error(`Entregas: nao preparou a tabela ou a tarifa: ${(e as Error).message}`);
    }
  }

  /**
   * Tarifas proprias, uma vez cada: ENTREGA (carro, valores do Popular) e
   * ENTREGA_MOTO (10/11/2026, 75% da entrega de carro). Desligadas; o
   * Evandro ajusta em Tarifas e liga em Entregas.
   */
  async sementeDaTarifa(): Promise<boolean> {
    let mudou = false;
    const lista = await lerCategorias(this.prisma);
    const novas = [
      { codigo: CODIGO_ENTREGA, nome: 'Entrega', descricao: 'Entrega de encomendas de carro (liga em Entregas)', base: 'CARRO', fator: 1 },
      { codigo: CODIGO_ENTREGA_MOTO, nome: 'Entrega de moto', descricao: 'Entrega de encomendas de moto (liga em Entregas)', base: CODIGO_ENTREGA, fator: 0.75 },
    ];
    for (const n of novas) {
      if (!lista.some((c) => c.codigo === n.codigo)) {
        lista.push({ codigo: n.codigo, nome: n.nome, ativa: false, icone: 'entrega', descricao: n.descricao, capacidade: 1, multiplicador: 1 });
        await gravarCategorias(this.prisma, lista);
        mudou = true;
      }
      const tem = await this.prisma.fareConfig.count({ where: { category: n.codigo } });
      if (tem > 0) continue;
      const base = await this.prisma.fareConfig.findMany({ where: { category: n.base } });
      const dez = (v: number) => Math.round((v * n.fator) / 10) * 10;
      for (const t of base) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...valores } = t;
        await this.prisma.fareConfig.upsert({
          where: { category_flag: { category: n.codigo, flag: t.flag as FareFlag } },
          create: {
            ...valores,
            category: n.codigo,
            baseFareCents: dez(t.baseFareCents),
            perKmCents: dez(t.perKmCents),
            perMinuteCents: dez(t.perMinuteCents),
            minFareCents: dez(t.minFareCents),
          },
          update: {},
        });
      }
      if (base.length > 0) {
        mudou = true;
        this.logger.log(`Entregas: tarifa propria "${n.nome}" criada (desligada em todas as cidades).`);
      }
    }
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

  // ------------------------------------------------------------------
  // Varias entregas no mesmo pedido (paradas no caminho)
  // ------------------------------------------------------------------

  /** Grava as entregas do caminho (na mesma transacao da corrida). Cada uma ganha o seu codigo. */
  async criarParadas(
    tx: ExecutorSql,
    rideId: string,
    lista: Array<{ sequencia: number; descricao: string; destinatarioNome: string; destinatarioTelefone: string }>,
  ): Promise<void> {
    for (const p of lista) {
      await tx.$executeRawUnsafe(
        'INSERT INTO "entrega_paradas" ("ride_id","sequencia","descricao","destinatario_nome","destinatario_telefone","codigo") VALUES ($1::uuid,$2,$3,$4,$5,$6)',
        rideId,
        p.sequencia,
        p.descricao.trim().slice(0, 200),
        p.destinatarioNome.trim().slice(0, 120),
        telefoneDeQuemRecebe(p.destinatarioTelefone).slice(0, 20),
        generateNumericCode(4),
      );
    }
  }

  async paradasDaCorrida(rideId: string): Promise<ParadaDaEntrega[]> {
    return this.prisma.$queryRawUnsafe<ParadaDaEntrega[]>(
      `SELECT "sequencia", "descricao", "destinatario_nome" AS "destinatarioNome", "destinatario_telefone" AS "destinatarioTelefone",
              "codigo", "tentativas", "entregue_em" AS "entregueEm"
         FROM "entrega_paradas" WHERE "ride_id" = $1::uuid ORDER BY "sequencia"`,
      rideId,
    );
  }

  /**
   * O motorista entregou a parada [sequencia]: na ORDEM da rota e com o codigo de quem
   * recebe. Repetir a mesma parada ja entregue nao faz nada (toque duplo).
   */
  async entregarParada(rideId: string, sequencia: number, digitado: string | null | undefined): Promise<void> {
    const lista = await this.paradasDaCorrida(rideId);
    const p = lista.find((x) => x.sequencia === sequencia);
    if (!p) throw BusinessException.notFound('Esta parada não existe nesta corrida.');
    if (p.entregueEm) return;
    const primeira = lista.find((x) => !x.entregueEm);
    if (primeira && primeira.sequencia !== sequencia) {
      throw BusinessException.validation(`Entregue primeiro a parada ${primeira.sequencia}, na ordem da rota.`);
    }
    const r = conferirCodigo(p, digitado);
    if (!r.ok) {
      if ((digitado ?? '').replace(/\D/g, '').length === 4 && p.tentativas < MAX_TENTATIVAS_CODIGO) {
        await this.prisma.$executeRawUnsafe('UPDATE "entrega_paradas" SET "tentativas" = "tentativas" + 1 WHERE "ride_id" = $1::uuid AND "sequencia" = $2', rideId, sequencia);
      }
      throw BusinessException.validation(r.motivo);
    }
    await this.prisma.$executeRawUnsafe(
      'UPDATE "entrega_paradas" SET "entregue_em" = now() WHERE "ride_id" = $1::uuid AND "sequencia" = $2 AND "entregue_em" IS NULL',
      rideId,
      sequencia,
    );
    // A parada da rota tambem registra a chegada (o mapa e o acompanhamento usam).
    await this.prisma.$executeRawUnsafe('UPDATE "ride_stops" SET "arrived_at" = now() WHERE "ride_id" = $1::uuid AND "sequence" = $2 AND "arrived_at" IS NULL', rideId, sequencia);
  }

  /** A ultima entrega (e o fim da corrida) so vale depois de todas as anteriores. */
  async exigirParadasEntregues(rideId: string): Promise<void> {
    const pendente = (await this.paradasDaCorrida(rideId)).find((x) => !x.entregueEm);
    if (pendente) throw BusinessException.validation(`Falta entregar a parada ${pendente.sequencia}. Peça o código a quem recebe e confirme antes de encerrar.`);
  }

  /** Para a resposta da corrida. O codigo nunca vai para o motorista; as tentativas so para a Central. */
  publicoParadas(lista: ParadaDaEntrega[], quem: QuemVe) {
    return lista.map((p) => ({
      sequencia: p.sequencia,
      descricao: p.descricao,
      destinatarioNome: p.destinatarioNome,
      destinatarioTelefone: p.destinatarioTelefone,
      entregueEm: p.entregueEm ? new Date(p.entregueEm).toISOString() : null,
      ...(quem === 'motorista' ? {} : { codigo: p.codigo }),
      ...(quem === 'central' ? { tentativas: p.tentativas } : {}),
    }));
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
    await this.prisma.$executeRawUnsafe('UPDATE "entrega_paradas" SET "tentativas" = 0 WHERE "ride_id" = $1::uuid', rideId);
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
        category: { in: [CODIGO_ENTREGA, CODIGO_ENTREGA_MOTO] },
        ...(status === 'abertas'
          ? { status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING, RideStatus.DRIVER_ASSIGNED, RideStatus.DRIVER_ARRIVING, RideStatus.DRIVER_WAITING, RideStatus.IN_PROGRESS] } }
          : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: {
        entrega: true,
        // Origem: entregas pedidas pelo aplicativo Comercio trazem o estabelecimento.
        comercioPedido: { select: { origem: true, comercio: { select: { nomeFantasia: true } } } },
        passenger: { select: { name: true, phone: true } },
        driver: { select: { user: { select: { name: true, phone: true } } } },
        vehicle: { select: { plate: true, model: true, category: true } },
      },
    });
    // Varias entregas num pedido: quantas ja foram entregues (as do caminho + a ultima).
    const progresso = new Map<string, { total: number; feitas: number }>();
    const ids = lista.map((r) => r.id);
    if (ids.length) {
      const linhas = await this.prisma
        .$queryRawUnsafe<Array<{ ride_id: string; total: number | bigint; feitas: number | bigint }>>(
          'SELECT "ride_id", COUNT(*) AS total, COUNT("entregue_em") AS feitas FROM "entrega_paradas" WHERE "ride_id" = ANY($1::uuid[]) GROUP BY "ride_id"',
          ids,
        )
        .catch(() => []);
      for (const l of linhas) progresso.set(l.ride_id, { total: Number(l.total), feitas: Number(l.feitas) });
    }
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
        origem: r.comercioPedido ? 'COMERCIO' : 'PASSAGEIRO',
        comercio: r.comercioPedido?.comercio.nomeFantasia ?? null,
        /** Comercio: APP (a loja pediu) ou MOTORISTA (lancada manualmente); entrega comum: null. */
        lancamento: r.comercioPedido ? (r.comercioPedido.origem === 'MOTORISTA' ? 'MOTORISTA' : 'APP') : null,
        cliente: { nome: r.passenger.name, telefone: r.passenger.phone },
        motorista: r.driver ? { nome: r.driver.user.name, telefone: r.driver.user.phone } : null,
        veiculo: r.vehicle ? `${r.vehicle.model} · ${r.vehicle.plate}` : null,
        pedidaEm: r.requestedAt.toISOString(),
        detalhe: this.publico(r.entrega, 'central'),
        /** Varias entregas: total e quantas ja foram entregues (entrega unica: 1 de 1 ou 0 de 1). */
        progresso: {
          total: (progresso.get(r.id)?.total ?? 0) + 1,
          concluidas: (progresso.get(r.id)?.feitas ?? 0) + (r.entrega?.entregueEm ? 1 : 0),
        },
      }));
    return { itens };
  }
}
