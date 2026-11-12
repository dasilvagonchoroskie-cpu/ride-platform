import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { UserRole } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { hashPassword } from '../../common/utils/crypto.util';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { pracaDoPonto } from '../pracas/pracas.store';
import { RidesService } from '../rides/rides.service';
import { telefoneDeQuemRecebe } from '../entregas/entregas.regras';
import {
  ROTULOS,
  decidir,
  descricaoParaMotorista,
  digitos,
  ehFinal,
  enderecoPorExtenso,
  etapaDaEntrega,
  motivoDeNaoPoderPedir,
  periodoPadrao,
  rotuloDaSituacao,
  somarGastos,
  valorCobrado,
  type Acao,
  type EntregaInput,
  type CotarInput,
} from './comercio.regras';

/** Tabelas do Comercio: so cria se faltar (como as entregas; nao mexe nas outras). */
const CRIAR_TABELAS = [
  `CREATE TABLE IF NOT EXISTS "comercios" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "nome_fantasia" VARCHAR(120) NOT NULL,
  "razao_social" VARCHAR(160),
  "cnpj" VARCHAR(14) NOT NULL,
  "responsavel_nome" VARCHAR(120) NOT NULL,
  "responsavel_cpf" VARCHAR(11),
  "telefone" VARCHAR(20) NOT NULL,
  "email" VARCHAR(160) NOT NULL,
  "logradouro" VARCHAR(200) NOT NULL,
  "numero" VARCHAR(20) NOT NULL,
  "complemento" VARCHAR(80),
  "bairro" VARCHAR(80) NOT NULL,
  "cidade" VARCHAR(80) NOT NULL,
  "uf" VARCHAR(2) NOT NULL,
  "cep" VARCHAR(8) NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "status" VARCHAR(12) NOT NULL DEFAULT 'AGUARDANDO',
  "motivo" VARCHAR(300),
  "decidido_por" UUID,
  "decidido_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comercios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comercios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "comercios_user_id_key" ON "comercios"("user_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "comercios_cnpj_key" ON "comercios"("cnpj")`,
  `CREATE TABLE IF NOT EXISTS "comercio_pedidos" (
  "ride_id" UUID NOT NULL,
  "comercio_id" UUID NOT NULL,
  "chave" VARCHAR(64) NOT NULL,
  "encomenda" VARCHAR(120) NOT NULL,
  "observacoes" VARCHAR(300),
  "dest_numero" VARCHAR(20) NOT NULL,
  "dest_complemento" VARCHAR(80),
  "dest_bairro" VARCHAR(80) NOT NULL,
  "dest_cidade" VARCHAR(80) NOT NULL,
  "dest_uf" VARCHAR(2) NOT NULL,
  "dest_cep" VARCHAR(8) NOT NULL,
  "dest_referencia" VARCHAR(160),
  "coleta_alternativa" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comercio_pedidos_pkey" PRIMARY KEY ("ride_id"),
  CONSTRAINT "comercio_pedidos_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comercio_pedidos_comercio_id_fkey" FOREIGN KEY ("comercio_id") REFERENCES "comercios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "comercio_pedidos_comercio_id_chave_key" ON "comercio_pedidos"("comercio_id", "chave")`,
  `CREATE INDEX IF NOT EXISTS "comercio_pedidos_comercio_id_created_at_idx" ON "comercio_pedidos"("comercio_id", "created_at")`,
];

const POR_PAGINA = 20;

/**
 * Chave geral do Comercio (13/11/2026). Nasce DESLIGADA: enquanto o dono nao
 * liga em Central -> Comercios, nenhum estabelecimento consulta preco nem pede
 * entrega, mesmo aprovado e mesmo que a entrega da cidade esteja ligada para
 * os passageiros. Cadastro, aprovacao e cancelamento seguem funcionando.
 */
export const CHAVE_COMERCIO = 'comercio.config';
const MENSAGEM_DESLIGADO = 'As entregas pelo aplicativo Comércio ainda não foram liberadas pela Central.';

type Linha = Prisma.ComercioGetPayload<Record<string, never>>;

/** O que o aplicativo (e a Central) ve do estabelecimento. */
export function comercioPublico(c: Linha) {
  return {
    id: c.id,
    nomeFantasia: c.nomeFantasia,
    razaoSocial: c.razaoSocial,
    cnpj: c.cnpj,
    responsavelNome: c.responsavelNome,
    responsavelCpf: c.responsavelCpf ? `***.${c.responsavelCpf.slice(3, 6)}.***-**` : null,
    telefone: c.telefone,
    email: c.email,
    endereco: {
      logradouro: c.logradouro,
      numero: c.numero,
      complemento: c.complemento,
      bairro: c.bairro,
      cidade: c.cidade,
      uf: c.uf,
      cep: c.cep,
      latitude: c.latitude,
      longitude: c.longitude,
      porExtenso: enderecoPorExtenso(c),
      temLocalizacao: c.latitude != null && c.longitude != null,
    },
    situacao: c.status,
    situacaoRotulo: rotuloDaSituacao(c.status),
    motivo: c.motivo,
    decididoEm: c.decididoEm?.toISOString() ?? null,
    criadoEm: c.createdAt.toISOString(),
  };
}

@Injectable()
export class ComercioService implements OnModuleInit {
  private readonly logger = new Logger(ComercioService.name);
  /** Toques repetidos no mesmo aparelho/instancia: so um passa de cada vez. */
  private readonly emAndamento = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rides: RidesService,
    private readonly pracas: PracasService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      for (const sql of CRIAR_TABELAS) await this.prisma.$executeRawUnsafe(sql);
    } catch (e) {
      this.logger.error(`Comercio: nao preparou as tabelas: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------
  // Cadastro do estabelecimento
  // ------------------------------------------------------------------

  async cadastrar(userId: string, input: Record<string, any>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.PASSENGER) {
      throw BusinessException.forbidden('Esta conta não pode cadastrar um estabelecimento.');
    }
    if (!user.emailVerifiedAt || !user.email) {
      throw BusinessException.validation('Confirme seu e-mail (código enviado por e-mail) antes de cadastrar o estabelecimento.');
    }
    if (user.email.toLowerCase() !== String(input.email).toLowerCase()) {
      throw BusinessException.validation('Use o mesmo e-mail com que você entrou (o que recebeu o código).');
    }
    if (await this.prisma.comercio.findUnique({ where: { userId } })) {
      throw BusinessException.conflict('Esta conta já tem um estabelecimento cadastrado.');
    }
    if (await this.prisma.comercio.findUnique({ where: { cnpj: input.cnpj } })) {
      throw BusinessException.conflict('Já existe um estabelecimento com este CNPJ.');
    }
    if (input.senha && user.passwordHash) {
      throw BusinessException.validation('Esta conta já tem senha. Para trocar, use "Esqueci minha senha".');
    }
    const comercio = await this.prisma.withTransaction(async (tx) => {
      const criado = await tx.comercio.create({
        data: {
          userId,
          nomeFantasia: input.nomeFantasia,
          razaoSocial: input.razaoSocial ?? null,
          cnpj: input.cnpj,
          responsavelNome: input.responsavelNome,
          responsavelCpf: input.responsavelCpf ?? null,
          telefone: input.telefone,
          email: user.email!,
          logradouro: input.logradouro,
          numero: input.numero,
          complemento: input.complemento ?? null,
          bairro: input.bairro,
          cidade: input.cidade,
          uf: input.uf,
          cep: input.cep,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          status: 'AGUARDANDO',
        },
      });
      if (input.senha && !user.passwordHash) {
        await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.senha) } });
      }
      await tx.auditLog.create({
        data: {
          actorId: userId,
          actorRole: UserRole.PASSENGER,
          action: 'COMERCIO_CADASTROU',
          entity: 'comercio',
          entityId: criado.id,
          // Sem CNPJ/CPF/telefone no registro: so o que a Central precisa para achar.
          after: { nomeFantasia: criado.nomeFantasia, cidade: criado.cidade, uf: criado.uf, situacao: 'AGUARDANDO' } as never,
        },
      });
      return criado;
    });
    return comercioPublico(comercio);
  }

  async meu(userId: string) {
    const c = await this.prisma.comercio.findUnique({ where: { userId } });
    const entregasLiberadas = await this.ativo();
    return c ? { cadastrado: true as const, comercio: comercioPublico(c), entregasLiberadas } : { cadastrado: false as const, comercio: null, entregasLiberadas };
  }

  async atualizar(userId: string, input: Record<string, any>) {
    const c = await this.doUsuario(userId);
    const endereco = ['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep'].some((k) => input[k] !== undefined);
    // Mudou o endereco e nao mandou a localizacao nova: a antiga deixa de valer
    // (o app busca de novo), senao o motorista iria para o lugar errado.
    const limpaLocal = endereco && input.latitude == null;
    const novo = await this.prisma.comercio.update({
      where: { id: c.id },
      data: {
        ...(input.nomeFantasia !== undefined ? { nomeFantasia: input.nomeFantasia } : {}),
        ...(input.razaoSocial !== undefined ? { razaoSocial: input.razaoSocial } : {}),
        ...(input.responsavelNome !== undefined ? { responsavelNome: input.responsavelNome } : {}),
        ...(input.telefone !== undefined ? { telefone: input.telefone } : {}),
        ...(input.logradouro !== undefined ? { logradouro: input.logradouro } : {}),
        ...(input.numero !== undefined ? { numero: input.numero } : {}),
        ...(input.complemento !== undefined ? { complemento: input.complemento } : {}),
        ...(input.bairro !== undefined ? { bairro: input.bairro } : {}),
        ...(input.cidade !== undefined ? { cidade: input.cidade } : {}),
        ...(input.uf !== undefined ? { uf: input.uf } : {}),
        ...(input.cep !== undefined ? { cep: input.cep } : {}),
        ...(input.latitude != null ? { latitude: input.latitude, longitude: input.longitude } : limpaLocal ? { latitude: null, longitude: null } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        actorRole: UserRole.PASSENGER,
        action: 'COMERCIO_ATUALIZOU',
        entity: 'comercio',
        entityId: c.id,
        after: { campos: Object.keys(input) } as never,
      },
    });
    return comercioPublico(novo);
  }

  /** Chave geral: so `ativo === true` liga. Sem registro, desligado. */
  async ativo(): Promise<boolean> {
    const r = await this.prisma.setting.findUnique({ where: { key: CHAVE_COMERCIO } });
    const v = r?.value;
    return !!v && typeof v === 'object' && !Array.isArray(v) && (v as { ativo?: unknown }).ativo === true;
  }

  private async exigirAtivo(): Promise<void> {
    if (!(await this.ativo())) throw BusinessException.forbidden(MENSAGEM_DESLIGADO);
  }

  async lerConfig() {
    return { ativo: await this.ativo() };
  }

  /** So o dono liga ou desliga (a guarda do controlador); fica auditado. */
  async gravarConfig(adminId: string, ativo: boolean) {
    const antes = await this.ativo();
    await this.prisma.setting.upsert({
      where: { key: CHAVE_COMERCIO },
      update: { value: { ativo } as never, updatedBy: adminId },
      create: { key: CHAVE_COMERCIO, value: { ativo } as never, updatedBy: adminId, description: 'Aplicativo Comercio: entregas liberadas (liga/desliga geral)' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: UserRole.ADMIN,
        action: 'COMERCIO_CONFIG',
        entity: 'setting',
        entityId: CHAVE_COMERCIO,
        before: { ativo: antes } as never,
        after: { ativo } as never,
      },
    });
    return { ativo };
  }

  /** O comerciante so enxerga o proprio estabelecimento. */
  private async doUsuario(userId: string): Promise<Linha> {
    const c = await this.prisma.comercio.findUnique({ where: { userId } });
    if (!c) throw BusinessException.notFound('Você ainda não cadastrou um estabelecimento.');
    return c;
  }

  private async aprovado(userId: string): Promise<Linha> {
    const c = await this.doUsuario(userId);
    const porque = motivoDeNaoPoderPedir(c.status);
    if (porque) throw BusinessException.forbidden(porque);
    return c;
  }

  // ------------------------------------------------------------------
  // Preco e pedido (tudo pelo mecanismo oficial da plataforma)
  // ------------------------------------------------------------------

  private coleta(c: Linha, alternativa?: { address: string; latitude: number; longitude: number; placeId?: string }) {
    if (alternativa) return { address: alternativa.address, latitude: alternativa.latitude, longitude: alternativa.longitude, placeId: alternativa.placeId };
    if (c.latitude == null || c.longitude == null) {
      throw BusinessException.validation('O endereço do estabelecimento ainda não tem localização no mapa. Abra "Meu estabelecimento" e confirme o endereço.');
    }
    return { address: enderecoPorExtenso(c), latitude: c.latitude, longitude: c.longitude, placeId: undefined };
  }

  private destino(d: EntregaInput['destino']) {
    return {
      address: enderecoPorExtenso(d),
      latitude: d.latitude,
      longitude: d.longitude,
      placeId: d.placeId,
    };
  }

  /** Consulta o preco ANTES de confirmar (nao cria nada). */
  async cotar(userId: string, input: CotarInput) {
    const c = await this.aprovado(userId);
    await this.exigirAtivo();
    const pickup = this.coleta(c, input.coletaAlternativa);
    const orc = await this.rides.estimar(
      { pickup, dropoff: this.destino(input.destino), category: 'ENTREGA', ...(input.cotacao ? { cotacao: input.cotacao } : {}) } as never,
      userId,
    );
    const opcoes = (orc.opcoesEntrega ?? []).map((o) => ({ veiculo: o.veiculo, nome: o.nome, valorCents: o.estimatedFareCents }));
    return {
      coleta: { endereco: pickup.address, alternativa: !!input.coletaAlternativa },
      entrega: { endereco: this.destino(input.destino).address },
      distanciaMetros: orc.distanceMeters,
      duracaoSegundos: orc.durationSeconds,
      // Mostra so o que a Central liberou na cidade. Nada e ligado por aqui.
      opcoes,
      cotacao: orc.cotacao,
    };
  }

  async pedir(userId: string, input: EntregaInput) {
    const c = await this.aprovado(userId);
    await this.exigirAtivo();
    const ja = await this.prisma.comercioPedido.findUnique({ where: { comercioId_chave: { comercioId: c.id, chave: input.chave } } });
    if (ja) return { ...(await this.detalhe(userId, ja.rideId)), repetido: true };

    const trava = `${c.id}:${input.chave}`;
    if (this.emAndamento.has(trava)) {
      throw BusinessException.conflict('Este pedido já está sendo enviado. Aguarde um instante.');
    }
    this.emAndamento.add(trava);
    try {
      const pickup = this.coleta(c, input.coletaAlternativa);
      const descricao = descricaoParaMotorista({
        nome: c.nomeFantasia,
        telefone: c.telefone,
        encomenda: input.encomenda.descricao,
        observacoes: input.encomenda.observacoes,
        referencia: input.destino.referencia,
      });
      let rideId: string;
      try {
        const corrida = await this.rides.pedir(
          userId,
          {
            pickup,
            dropoff: this.destino(input.destino),
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
              await tx.comercioPedido.create({
                data: {
                  rideId: id,
                  comercioId: c.id,
                  chave: input.chave,
                  encomenda: input.encomenda.descricao,
                  observacoes: input.encomenda.observacoes ?? null,
                  destNumero: input.destino.numero,
                  destComplemento: input.destino.complemento ?? null,
                  destBairro: input.destino.bairro,
                  destCidade: input.destino.cidade,
                  destUf: input.destino.uf,
                  destCep: input.destino.cep,
                  destReferencia: input.destino.referencia ?? null,
                  coletaAlternativa: !!input.coletaAlternativa,
                },
              });
            },
          },
        );
        rideId = (corrida as unknown as { ride: { id: string } }).ride.id;
      } catch (e) {
        // Dois toques ao mesmo tempo em instancias diferentes: o banco recusou o segundo
        // (e a corrida dele foi desfeita junto). Devolve a entrega que ja existe.
        if ((e as { code?: string }).code === 'P2002') {
          const existente = await this.prisma.comercioPedido.findUnique({ where: { comercioId_chave: { comercioId: c.id, chave: input.chave } } });
          if (existente) return { ...(await this.detalhe(userId, existente.rideId)), repetido: true };
        }
        throw e;
      }
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorRole: UserRole.PASSENGER,
          action: 'COMERCIO_PEDIU_ENTREGA',
          entity: 'ride',
          entityId: rideId,
          after: { comercioId: c.id, veiculo: input.veiculo, coletaAlternativa: !!input.coletaAlternativa } as never,
        },
      });
      return { ...(await this.detalhe(userId, rideId)), repetido: false };
    } finally {
      this.emAndamento.delete(trava);
    }
  }

  // ------------------------------------------------------------------
  // Acompanhar, historico, repetir, gastos
  // ------------------------------------------------------------------

  private include() {
    return {
      ride: {
        include: {
          entrega: true,
          driver: { select: { user: { select: { name: true } } } },
          vehicle: { select: { plate: true, model: true } },
        },
      },
    } as const;
  }

  private item(p: any) {
    const r = p.ride;
    const e = r.entrega;
    const etapa = etapaDaEntrega({ status: r.status, coletadaEm: e?.coletadaEm, entregueEm: e?.entregueEm });
    return {
      id: r.id,
      codigo: r.code,
      origem: 'COMERCIO' as const,
      etapa,
      situacao: ROTULOS[etapa],
      final: ehFinal(etapa),
      criadaEm: r.requestedAt.toISOString(),
      encomenda: p.encomenda,
      observacoes: p.observacoes,
      destinatario: { nome: e?.destinatarioNome ?? null, telefone: e?.destinatarioTelefone ?? null },
      enderecoDeEntrega: r.dropoffAddress,
      enderecoDeColeta: r.pickupAddress,
      coletaAlternativa: p.coletaAlternativa,
      veiculo: String(r.category).toUpperCase().includes('MOTO') ? 'MOTO' : 'CARRO',
      valorEstimadoCents: r.estimatedFareCents,
      valorCobradoCents: valorCobrado(r),
      coletadaEm: e?.coletadaEm?.toISOString() ?? null,
      entregueEm: e?.entregueEm?.toISOString() ?? null,
      canceladaEm: r.cancelledAt?.toISOString() ?? null,
      motoristaNome: r.driver?.user?.name?.split(' ')[0] ?? null,
      veiculoDoMotorista: r.vehicle ? `${r.vehicle.model} · ${r.vehicle.plate}` : null,
    };
  }

  /** Uma entrega do PROPRIO estabelecimento (de outro, responde como se nao existisse). */
  async detalhe(userId: string, rideId: string) {
    const c = await this.doUsuario(userId);
    const p = await this.prisma.comercioPedido.findFirst({ where: { rideId, comercioId: c.id }, include: this.include() });
    if (!p) throw BusinessException.notFound('Entrega não encontrada.');
    const base = this.item(p);
    // O codigo de 4 numeros e de quem recebe: o comerciante repassa a ele.
    // (O motorista nunca ve; ele pede a quem recebe.)
    const codigo = p.ride.entrega && !base.final ? p.ride.entrega.codigo : null;
    let ao_vivo: unknown = null;
    if (!base.final) {
      try {
        ao_vivo = await this.rides.acompanharDoPassageiro(userId, UserRole.PASSENGER, rideId);
      } catch {
        ao_vivo = null; // sem localizacao agora: a tela mostra so o estado
      }
    }
    return { ...base, codigoDeEntrega: codigo, aoVivo: ao_vivo };
  }

  async historico(userId: string, pagina = 1) {
    const c = await this.doUsuario(userId);
    const [total, lista] = await Promise.all([
      this.prisma.comercioPedido.count({ where: { comercioId: c.id } }),
      this.prisma.comercioPedido.findMany({
        where: { comercioId: c.id },
        orderBy: { createdAt: 'desc' },
        take: POR_PAGINA,
        skip: (Math.max(1, pagina) - 1) * POR_PAGINA,
        include: this.include(),
      }),
    ]);
    return { total, pagina, porPagina: POR_PAGINA, itens: lista.map((p) => this.item(p)) };
  }

  /** Cancelar so a propria entrega; as regras (multa etc.) sao as da corrida. */
  async cancelar(userId: string, rideId: string, motivo?: string) {
    const c = await this.doUsuario(userId);
    const p = await this.prisma.comercioPedido.findFirst({ where: { rideId, comercioId: c.id } });
    if (!p) throw BusinessException.notFound('Entrega não encontrada.');
    await this.rides.cancelar(userId, UserRole.PASSENGER as never, rideId, { reason: motivo ?? 'Cancelada pelo estabelecimento' } as never);
    await this.prisma.auditLog.create({
      data: { actorId: userId, actorRole: UserRole.PASSENGER, action: 'COMERCIO_CANCELOU_ENTREGA', entity: 'ride', entityId: rideId },
    });
    return this.detalhe(userId, rideId);
  }

  /**
   * "Repetir": devolve os dados da entrega anterior para PREENCHER a tela.
   * Nao cria nada: o comerciante confere, o preco e consultado de novo e ele
   * confirma (chave nova).
   */
  async repetir(userId: string, rideId: string) {
    const c = await this.doUsuario(userId);
    const p = await this.prisma.comercioPedido.findFirst({ where: { rideId, comercioId: c.id }, include: this.include() });
    if (!p) throw BusinessException.notFound('Entrega não encontrada.');
    const r = p.ride;
    return {
      encomenda: { descricao: p.encomenda, observacoes: p.observacoes },
      destinatario: { nome: r.entrega?.destinatarioNome ?? '', telefone: r.entrega?.destinatarioTelefone ?? '' },
      destino: {
        porExtenso: r.dropoffAddress,
        latitude: r.dropoffLat,
        longitude: r.dropoffLng,
        numero: p.destNumero,
        complemento: p.destComplemento,
        bairro: p.destBairro,
        cidade: p.destCidade,
        uf: p.destUf,
        cep: p.destCep,
        referencia: p.destReferencia,
      },
      veiculo: String(r.category).toUpperCase().includes('MOTO') ? 'MOTO' : 'CARRO',
      criaEntrega: false,
      aviso: 'Confira os dados. O preço será consultado de novo e a entrega só é pedida quando você confirmar.',
    };
  }

  async gastos(userId: string, periodo?: { de?: Date; ate?: Date }) {
    const c = await this.doUsuario(userId);
    return this.gastosDe(c.id, periodo);
  }

  private async gastosDe(comercioId: string, periodo?: { de?: Date; ate?: Date }) {
    const padrao = periodoPadrao();
    const de = periodo?.de ?? padrao.de;
    const ate = periodo?.ate ?? padrao.ate;
    const lista = await this.prisma.comercioPedido.findMany({
      where: { comercioId, createdAt: { gte: de, lt: ate } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: this.include(),
    });
    const resumo = somarGastos(lista.map((p) => p.ride));
    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      ...resumo,
      cobrancas: lista
        .filter((p) => p.ride.status === 'COMPLETED')
        .map((p) => ({
          id: p.ride.id,
          codigo: p.ride.code,
          em: (p.ride.finishedAt ?? p.ride.requestedAt).toISOString(),
          destinatario: p.ride.entrega?.destinatarioNome ?? null,
          valorCents: valorCobrado(p.ride),
        })),
    };
  }

  // ------------------------------------------------------------------
  // Central
  // ------------------------------------------------------------------

  private async pracaDe(c: Pick<Linha, 'latitude' | 'longitude'>): Promise<string | null> {
    if (c.latitude == null || c.longitude == null) return null;
    return pracaDoPonto(await this.pracas.listar(), { latitude: c.latitude, longitude: c.longitude })?.id ?? null;
  }

  /** Operador de cidade so ve estabelecimentos da cidade dele (sem localizacao: so o dono). */
  private async visivel(c: Linha, praca: string | null): Promise<boolean> {
    if (!praca) return true;
    return (await this.pracaDe(c)) === praca;
  }

  async adminListar(praca: string | null, f: { situacao?: string; busca?: string }) {
    const lista = await this.prisma.comercio.findMany({
      where: {
        ...(f.situacao ? { status: f.situacao } : {}),
        ...(f.busca
          ? {
              OR: [
                { nomeFantasia: { contains: f.busca, mode: 'insensitive' } },
                { cnpj: { contains: digitos(f.busca) || '#' } },
                { email: { contains: f.busca, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const itens = [];
    for (const c of lista) {
      if (!(await this.visivel(c, praca))) continue;
      itens.push({ ...comercioPublico(c), praca: await this.pracaDe(c) });
    }
    return { itens };
  }

  async adminDetalhe(praca: string | null, id: string) {
    const c = await this.prisma.comercio.findUnique({ where: { id } });
    if (!c || !(await this.visivel(c, praca))) throw BusinessException.notFound('Estabelecimento não encontrado.');
    return { ...comercioPublico(c), praca: await this.pracaDe(c), gastos: await this.gastosDe(c.id) };
  }

  /** Aprovar, rejeitar, suspender, reativar (so o dono; tudo auditado). */
  async adminDecidir(adminId: string, id: string, acao: Acao, motivo?: string) {
    const c = await this.prisma.comercio.findUnique({ where: { id } });
    if (!c) throw BusinessException.notFound('Estabelecimento não encontrado.');
    const r = decidir(c.status, acao, motivo);
    if (!r.ok) throw BusinessException.validation(r.erro);
    const novo = await this.prisma.comercio.update({
      where: { id },
      data: { status: r.para, motivo: motivo?.trim() || null, decididoPor: adminId, decididoEm: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: UserRole.ADMIN,
        action: `COMERCIO_${acao}`,
        entity: 'comercio',
        entityId: id,
        before: { situacao: c.status } as never,
        after: { situacao: r.para, motivo: motivo?.trim() || null } as never,
      },
    });
    return comercioPublico(novo);
  }

  /** Entregas pedidas pelo aplicativo Comercio (origem identificada), com o andamento. */
  async adminPedidos(praca: string | null, f: { status?: string; comercioId?: string }) {
    const lista = await this.prisma.comercioPedido.findMany({
      where: { ...(f.comercioId ? { comercioId: f.comercioId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { ...this.include(), comercio: { select: { nomeFantasia: true, latitude: true, longitude: true } } },
    });
    const todas = await this.pracas.listar();
    const itens = lista
      .map((p) => ({ p, praca: pracaDoPonto(todas, { latitude: p.ride.pickupLat, longitude: p.ride.pickupLng })?.id ?? null }))
      .filter(({ praca: pr }) => !praca || pr === praca)
      .map(({ p, praca: pr }) => ({ ...this.item(p), comercio: p.comercio.nomeFantasia, praca: pr, comissaoCents: p.ride.commissionCents }))
      .filter((i) => (f.status === 'abertas' ? !i.final : true));
    return { itens };
  }
}
