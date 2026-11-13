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
import { ComercioAvisosService } from './comercio.avisos';
import { COMERCIO_TERMS_VERSION } from './comercio.termos';
import {
  ROTULOS,
  cnpjParcial,
  decidir,
  finalDoTelefone,
  motivoParaMotorista,
  tipoDeBusca,
  veiculoDaCategoria,
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
  type Etapa,
  type EntregaInput,
  type CotarInput,
  type CotarManualInput,
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
  // Termos de uso do Comercio (13/11/2026): so colunas novas na tabela NOVA do Comercio.
  `ALTER TABLE "comercios" ADD COLUMN IF NOT EXISTS "termos_versao" VARCHAR(30)`,
  `ALTER TABLE "comercios" ADD COLUMN IF NOT EXISTS "termos_aceitos_em" TIMESTAMP(3)`,
  // Lancamento manual pelo motorista (12/11/2026): so colunas novas na tabela NOVA do Comercio.
  `ALTER TABLE "comercio_pedidos" ADD COLUMN IF NOT EXISTS "origem" VARCHAR(10) NOT NULL DEFAULT 'APP'`,
  `ALTER TABLE "comercio_pedidos" ADD COLUMN IF NOT EXISTS "lancado_por" UUID`,
  `ALTER TABLE "comercio_pedidos" ADD COLUMN IF NOT EXISTS "lancado_em" TIMESTAMP(3)`,
];

const POR_PAGINA = 20;
/** Teto de seguranca da soma de gastos (muito acima do uso real de uma loja num periodo). */
const LIMITE_DA_SOMA = 20_000;
const LIMITE_DA_LISTA = 500;
/** Entregas abertas ao mesmo tempo por loja: protege os motoristas de uma enxurrada de pedidos. */
export const MAX_ABERTAS_POR_LOJA = 20;
const STATUS_ABERTOS = ['SCHEDULED', 'REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'];

/**
 * Chave geral do Comercio (13/11/2026). Nasce DESLIGADA: enquanto o dono nao
 * liga em Central -> Comercios, nenhum estabelecimento consulta preco nem pede
 * entrega, mesmo aprovado e mesmo que a entrega da cidade esteja ligada para
 * os passageiros. Cadastro, aprovacao e cancelamento seguem funcionando.
 */
export const CHAVE_COMERCIO = 'comercio.config';
/** O app reconhece esta frase para voltar a tela de consulta de preco. */
export const MENSAGEM_PRECO_MUDOU = 'O preço mudou:';
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
    termosVersao: c.termosVersao ?? null,
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
    private readonly avisos: ComercioAvisosService,
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
    if (input.aceiteTermos !== true) {
      throw BusinessException.validation('Leia e aceite os termos de uso do Comércio para cadastrar o estabelecimento.');
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
          termosVersao: COMERCIO_TERMS_VERSION,
          termosAceitosEm: new Date(),
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
          after: { nomeFantasia: criado.nomeFantasia, cidade: criado.cidade, uf: criado.uf, situacao: 'AGUARDANDO', termos: COMERCIO_TERMS_VERSION } as never,
        },
      });
      return criado;
    });
    await this.avisos.cadastroRecebido(userId, comercio.nomeFantasia);
    return comercioPublico(comercio);
  }

  async meu(userId: string) {
    const c = await this.prisma.comercio.findUnique({ where: { userId } });
    const entregasLiberadas = await this.ativo();
    const termos = { versaoAtual: COMERCIO_TERMS_VERSION, revisadoPorAdvogado: false };
    return c ? { cadastrado: true as const, comercio: comercioPublico(c), entregasLiberadas, termos } : { cadastrado: false as const, comercio: null, entregasLiberadas, termos };
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

  /**
   * Portas do Comercio, nesta ordem, antes de qualquer consulta ou pedido:
   * (1) e-mail da conta confirmado, (2) estabelecimento APROVADO pelo dono,
   * (3) chave geral ligada. As outras duas (Entrega ligada na cidade da coleta e
   * veiculo aceito na cidade) ficam dentro do pedido oficial (`RidesService`).
   */
  private async podePedir(userId: string): Promise<Linha> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, email: true, role: true } });
    if (!u || u.role !== UserRole.PASSENGER || !u.emailVerifiedAt || !u.email) {
      throw BusinessException.forbidden('Confirme seu e-mail (código enviado por e-mail) antes de pedir entregas.');
    }
    const c = await this.aprovado(userId);
    await this.exigirAtivo();
    return c;
  }

  /**
   * As mesmas tres portas, na mesma ordem, para um estabelecimento ja escolhido:
   * usado no lancamento manual pelo motorista. Nao existe caminho mais curto.
   */
  async portasDe(c: Linha): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: c.userId }, select: { emailVerifiedAt: true, email: true, role: true } });
    if (!u || u.role !== UserRole.PASSENGER || !u.emailVerifiedAt || !u.email) {
      throw BusinessException.forbidden('O e-mail deste estabelecimento ainda não foi confirmado. Ele precisa confirmar pelo aplicativo Comércio.');
    }
    const porque = motivoDeNaoPoderPedir(c.status);
    if (porque) throw BusinessException.forbidden(porque);
    await this.exigirAtivo();
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

  /**
   * Coleta alternativa so dentro da cidade do estabelecimento (auditoria 13/11): sem isto, uma
   * loja de uma cidade sem entregas poderia "coletar" em outra cidade que tenha a Entrega ligada.
   */
  private async exigirColetaNaCidade(c: Linha, alternativa?: { latitude: number; longitude: number }): Promise<void> {
    if (!alternativa || c.latitude == null || c.longitude == null) return;
    const [daLoja, daColeta] = await Promise.all([this.pracaDe(c), this.pracaDe(alternativa)]);
    if (daLoja !== daColeta) {
      throw BusinessException.validation('A coleta em outro endereço precisa ser na mesma cidade do estabelecimento.');
    }
  }

  /**
   * Honestidade do preco: a loja confirmou um valor; se o preco OFICIAL mudou desde a consulta
   * (tarifa, bandeira da hora), o pedido nao e criado com outro valor sem ela saber.
   */
  private async exigirMesmoPreco(userId: string, c: Linha, input: EntregaInput): Promise<void> {
    const pickup = this.coleta(c, input.coletaAlternativa);
    const orc = await this.rides.estimar(
      { pickup, dropoff: this.destino(input.destino), category: 'ENTREGA', ...(input.cotacao ? { cotacao: input.cotacao } : {}) } as never,
      userId,
    );
    const opcao = (orc.opcoesEntrega ?? []).find((o) => o.veiculo === input.veiculo);
    if (!opcao) throw BusinessException.validation('Este veículo não está disponível agora. Consulte o preço de novo.');
    if (opcao.estimatedFareCents !== input.valorEsperadoCents) {
      const reais = (v: number) => `R$ ${(v / 100).toFixed(2).replace('.', ',')}`;
      throw BusinessException.conflict(`${MENSAGEM_PRECO_MUDOU} era ${reais(input.valorEsperadoCents!)} e agora é ${reais(opcao.estimatedFareCents)}. Consulte o preço de novo.`);
    }
  }

  /** Teto de entregas abertas por loja: a loja pode ter varias, mas nao uma enxurrada para os motoristas. */
  private async exigirLimiteDeAbertas(comercioId: string): Promise<void> {
    const abertas = await this.prisma.comercioPedido.count({
      where: { comercioId, ride: { status: { in: STATUS_ABERTOS as never } } },
    });
    if (abertas >= MAX_ABERTAS_POR_LOJA) {
      throw BusinessException.conflict(`Você já tem ${MAX_ABERTAS_POR_LOJA} entregas em andamento. Aguarde alguma terminar ou cancele uma antes de pedir outra.`);
    }
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
    const c = await this.podePedir(userId);
    return this.cotarDe(c, input);
  }

  /** O preco oficial para o estabelecimento [c] (a conta dele e quem "pede" no motor de corridas). */
  private async cotarDe(c: Linha, input: CotarInput) {
    await this.exigirColetaNaCidade(c, input.coletaAlternativa);
    const pickup = this.coleta(c, input.coletaAlternativa);
    const orc = await this.rides.estimar(
      { pickup, dropoff: this.destino(input.destino), category: 'ENTREGA', ...(input.cotacao ? { cotacao: input.cotacao } : {}) } as never,
      c.userId,
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

  // ------------------------------------------------------------------
  // Lancamento manual pelo motorista: so leitura e preco aqui; o pedido sai
  // pelo mesmo `criarEntrega` da loja (EntregaManualService, modulo da Central).
  // ------------------------------------------------------------------

  /** O motorista precisa estar aprovado; devolve o cadastro e a praca dele. */
  async motoristaAprovado(userId: string) {
    const m = await this.prisma.driver.findFirst({
      where: { userId, user: { deletedAt: null } },
      select: { id: true, status: true, userId: true, isOnline: true },
    });
    if (!m) throw BusinessException.forbidden('Esta conta não tem cadastro de motorista.');
    if (m.status !== 'APPROVED') throw BusinessException.forbidden('Seu cadastro de motorista ainda não foi aprovado.');
    return { ...m, praca: await this.pracas.pracaDoMotorista(m.id) };
  }

  /** O veiculo em uso do motorista decide se a entrega e de moto ou de carro. */
  async veiculoDoMotorista(driverId: string): Promise<'MOTO' | 'CARRO'> {
    const v = await this.prisma.vehicle.findFirst({ where: { driverId, isActive: true }, select: { category: true } });
    if (!v) throw BusinessException.validation('Você não tem veículo em uso. Confira o cadastro do seu veículo.');
    return veiculoDaCategoria(v.category);
  }

  /** Estabelecimento visto pelo motorista: so os da cidade dele (de outra cidade responde como se nao existisse). */
  async comercioParaMotorista(praca: string | null, comercioId: string): Promise<Linha> {
    const c = await this.prisma.comercio.findUnique({ where: { id: comercioId } });
    if (!c || (await this.pracaDe(c)) !== praca) throw BusinessException.notFound('Estabelecimento não encontrado.');
    return c;
  }

  async buscarParaMotorista(userId: string, busca: string) {
    const m = await this.motoristaAprovado(userId);
    const q = tipoDeBusca(busca);
    const onde: Prisma.ComercioWhereInput =
      q.tipo === 'EMAIL'
        ? { OR: [{ email: q.valor }, { user: { email: q.valor } }] }
        : q.tipo === 'TELEFONE'
          ? { OR: [{ telefone: { endsWith: q.valor } }, { user: { phone: { endsWith: q.valor } } }] }
          : { nomeFantasia: { contains: q.valor, mode: 'insensitive' } };
    const achados = await this.prisma.comercio.findMany({ where: onde, orderBy: { nomeFantasia: 'asc' }, take: 25 });
    const itens = [];
    for (const c of achados) {
      if ((await this.pracaDe(c)) !== m.praca) continue;
      const motivo = motivoParaMotorista(c.status);
      itens.push({
        id: c.id,
        nomeFantasia: c.nomeFantasia,
        endereco: `${c.logradouro}, ${c.numero}, ${c.bairro}`,
        cidade: c.cidade,
        telefoneFinal: finalDoTelefone(c.telefone),
        situacao: c.status,
        situacaoRotulo: rotuloDaSituacao(c.status),
        podeLancar: motivo === null,
        motivo,
      });
      if (itens.length >= 8) break;
    }
    return { itens, liberado: await this.ativo() };
  }

  async perfilParaMotorista(userId: string, comercioId: string) {
    const m = await this.motoristaAprovado(userId);
    const c = await this.comercioParaMotorista(m.praca, comercioId);
    const [concluidas, recentes] = await Promise.all([
      // Concluida = a corrida terminou como COMPLETED (nunca pedido iniciado ou cancelado).
      this.prisma.comercioPedido.count({ where: { comercioId: c.id, ride: { status: 'COMPLETED' } } }),
      this.prisma.comercioPedido.findMany({
        where: { comercioId: c.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: this.include(),
      }),
    ]);
    const motivo = motivoParaMotorista(c.status);
    return {
      id: c.id,
      nomeFantasia: c.nomeFantasia,
      razaoSocial: c.razaoSocial,
      cnpj: cnpjParcial(c.cnpj),
      telefone: c.telefone,
      enderecoDeRetirada: enderecoPorExtenso(c),
      cidade: c.cidade,
      uf: c.uf,
      situacao: c.status,
      situacaoRotulo: rotuloDaSituacao(c.status),
      podeLancar: motivo === null,
      motivo,
      entregasConcluidas: concluidas,
      // Sem telefone de quem recebe nem endereco completo: so o que identifica a entrega.
      historico: recentes.map((p) => {
        const i = this.item(p);
        return { codigo: i.codigo, em: i.criadaEm, situacao: i.situacao, final: i.final, origem: p.origem, bairro: p.destBairro };
      }),
    };
  }

  async cotarParaMotorista(userId: string, input: CotarManualInput) {
    const m = await this.motoristaAprovado(userId);
    const c = await this.comercioParaMotorista(m.praca, input.comercioId);
    await this.portasDe(c);
    const veiculo = await this.veiculoDoMotorista(m.id);
    const r = await this.cotarDe(c, { ...input, veiculo });
    // Entrega pelo veiculo do proprio motorista: so a opcao dele conta.
    const opcoes = r.opcoes.filter((o) => o.veiculo === veiculo);
    return { ...r, opcoes, veiculo };
  }

  async pedir(userId: string, input: EntregaInput) {
    const c = await this.podePedir(userId);
    const r = await this.criarEntrega(c, input, { atorId: userId, atorRole: UserRole.PASSENGER, origem: 'APP' });
    return { ...(await this.detalhe(userId, r.rideId)), repetido: r.repetido };
  }

  /**
   * O pedido oficial, igual para as duas origens (a loja pelo aplicativo ou o
   * motorista lancando manualmente): chave anti-duplicidade, coleta na cidade da
   * loja, teto de entregas abertas, preco confirmado = preco do servidor, e o
   * pedido gravado na MESMA transacao da corrida. As portas (e-mail, aprovacao,
   * chave geral) sao conferidas por quem chama, antes.
   */
  async criarEntrega(
    c: Linha,
    input: EntregaInput,
    quem: { atorId: string; atorRole: UserRole; origem: 'APP' | 'MOTORISTA'; motoristaId?: string },
  ): Promise<{ rideId: string; repetido: boolean }> {
    const ja = await this.prisma.comercioPedido.findUnique({ where: { comercioId_chave: { comercioId: c.id, chave: input.chave } } });
    if (ja) return { rideId: ja.rideId, repetido: true };
    await this.exigirColetaNaCidade(c, input.coletaAlternativa);
    await this.exigirLimiteDeAbertas(c.id);
    if (input.valorEsperadoCents != null) await this.exigirMesmoPreco(c.userId, c, input);

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
          c.userId,
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
                  origem: quem.origem,
                  ...(quem.origem === 'MOTORISTA' ? { lancadoPor: quem.motoristaId ?? null, lancadoEm: new Date() } : {}),
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
          if (existente) return { rideId: existente.rideId, repetido: true };
        }
        throw e;
      }
      await this.prisma.auditLog.create({
        data: {
          actorId: quem.atorId,
          actorRole: quem.atorRole,
          action: quem.origem === 'MOTORISTA' ? 'COMERCIO_ENTREGA_LANCADA_PELO_MOTORISTA' : 'COMERCIO_PEDIU_ENTREGA',
          entity: 'ride',
          entityId: rideId,
          after: { comercioId: c.id, origem: quem.origem, veiculo: input.veiculo, coletaAlternativa: !!input.coletaAlternativa } as never,
        },
      });
      return { rideId, repetido: false };
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
      /** APP = a loja pediu pelo aplicativo; MOTORISTA = lancada manualmente pelo motorista (12/11/2026). */
      lancamento: p.origem === 'MOTORISTA' ? ('MOTORISTA' as const) : ('APP' as const),
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
    // So o que o mapa precisa (nunca a corrida inteira: telefone do motorista etc.).
    const mapa = base.final ? null : await this.mapaDaEntrega(p.ride);
    await this.avisos.deEntrega(c.userId, rideId, base.etapa as Etapa, p.ride.driver?.user?.name?.split(' ')[0] ?? null);
    return { ...base, codigoDeEntrega: codigo, mapa };
  }

  /**
   * Pontos do mapa do acompanhamento: coleta, entrega e, SO enquanto o motorista
   * esta com a entrega, a ultima posicao que o aparelho dele mandou (o mesmo
   * dado que o passageiro ve nas corridas). Sem posicao, vem null — o app nao
   * inventa ponto. `desatualizada` = ha mais de 2 minutos sem sinal.
   */
  private async mapaDaEntrega(r: any) {
    const ponto = (lat: unknown, lng: unknown) =>
      typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
    const comCarro = ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'];
    let motorista: { latitude: number; longitude: number; atualizadaEm: string; desatualizada: boolean } | null = null;
    if (r.driverId && comCarro.includes(r.status)) {
      try {
        const pos = await this.rides.posicaoDoMotorista(r.driverId);
        if (pos) {
          motorista = {
            latitude: pos.latitude,
            longitude: pos.longitude,
            atualizadaEm: pos.updatedAt,
            desatualizada: Date.now() - Date.parse(pos.updatedAt) > 120_000,
          };
        }
      } catch {
        motorista = null; // sem localizacao agora: a tela segue so com o estado
      }
    }
    return { coleta: ponto(r.pickupLat, r.pickupLng), entrega: ponto(r.dropoffLat, r.dropoffLng), motorista };
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
    const filtro = { comercioId, createdAt: { gte: de, lt: ate } };
    // Auditoria 13/11: o total sai de TODAS as entregas do periodo (so o minimo de cada uma).
    // Antes, o total era somado so sobre as 500 mais recentes e ficava menor sem avisar.
    const linhas = await this.prisma.comercioPedido.findMany({
      where: filtro,
      select: { ride: { select: { status: true, finalFareCents: true, estimatedFareCents: true } } },
      take: LIMITE_DA_SOMA,
    });
    const resumo = somarGastos(linhas.map((p) => p.ride));
    const lista = await this.prisma.comercioPedido.findMany({
      where: { ...filtro, ride: { status: 'COMPLETED' as never } },
      orderBy: { createdAt: 'desc' },
      take: LIMITE_DA_LISTA,
      include: this.include(),
    });
    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      ...resumo,
      // true = a lista de cobrancas abaixo mostra so as mais recentes (o total acima continua completo).
      listaCortada: resumo.realizadas > LIMITE_DA_LISTA,
      cobrancas: lista.map((p) => ({
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
    const where = {
      ...(f.situacao ? { status: f.situacao } : {}),
      ...(f.busca
        ? {
            OR: [
              { nomeFantasia: { contains: f.busca, mode: 'insensitive' as const } },
              { cnpj: { contains: digitos(f.busca) || '#' } },
              { email: { contains: f.busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    // A cidade do estabelecimento sai da posicao dele (nao e uma coluna): le em lotes e
    // filtra ate juntar o limite, para o operador de uma cidade nao perder cadastros
    // porque os 300 mais novos eram de outra cidade.
    const itens = await lerEmLotes(
      (skip, take) => this.prisma.comercio.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      async (c) => ((await this.visivel(c, praca)) ? { ...comercioPublico(c), praca: await this.pracaDe(c) } : null),
    );
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
    // Trava contra duas decisoes ao mesmo tempo (dois cliques, duas abas): so grava se a
    // situacao ainda e a que foi lida; a segunda tentativa recebe um aviso e nao duplica a auditoria.
    const gravou = await this.prisma.comercio.updateMany({
      where: { id, status: c.status },
      data: { status: r.para, motivo: motivo?.trim() || null, decididoPor: adminId, decididoEm: new Date() },
    });
    if (gravou.count === 0) {
      throw BusinessException.conflict('Este estabelecimento acabou de ser alterado por outra decisão. Atualize a tela e confira a situação.');
    }
    const novo = (await this.prisma.comercio.findUnique({ where: { id } })) as NonNullable<typeof c>;
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
    await this.avisos.decisao(novo.userId, acao, novo.nomeFantasia, novo.motivo);
    return comercioPublico(novo);
  }

  /** Entregas pedidas pelo aplicativo Comercio (origem identificada), com o andamento. */
  async adminPedidos(praca: string | null, f: { status?: string; comercioId?: string }) {
    const todas = await this.pracas.listar();
    const lista = await lerEmLotes(
      (skip, take) =>
        this.prisma.comercioPedido.findMany({
          where: { ...(f.comercioId ? { comercioId: f.comercioId } : {}) },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { ...this.include(), comercio: { select: { nomeFantasia: true, latitude: true, longitude: true } } },
        }),
      // A cidade vem do ponto de coleta da corrida; antes o corte de 300 vinha ANTES deste filtro.
      async (p) => {
        const pr = pracaDoPonto(todas, { latitude: p.ride.pickupLat, longitude: p.ride.pickupLng })?.id ?? null;
        if (praca && pr !== praca) return null;
        if (f.status === 'abertas' && this.item(p).final) return null;
        return { p, praca: pr };
      },
    );
    // Quem lancou manualmente (motorista) e quando: para a auditoria na Central.
    const lancadores = [...new Set(lista.map(({ p }) => p.lancadoPor).filter((x): x is string => !!x))];
    const nomes = new Map<string, string>();
    if (lancadores.length) {
      const motoristas = await this.prisma.driver.findMany({ where: { id: { in: lancadores } }, select: { id: true, user: { select: { name: true } } } });
      for (const m of motoristas) nomes.set(m.id, m.user?.name ?? 'Motorista');
    }
    const itens = lista.map(({ p, praca: pr }) => ({
      ...this.item(p),
      comercio: p.comercio.nomeFantasia,
      praca: pr,
      comissaoCents: p.ride.commissionCents,
      lancadoPor: p.lancadoPor ? (nomes.get(p.lancadoPor) ?? 'Motorista') : null,
      lancadoEm: p.lancadoEm ? new Date(p.lancadoEm).toISOString() : null,
    }));
    return { itens };
  }
}

/**
 * Le uma lista grande em lotes de 300 e devolve so o que passa no filtro (que roda no
 * aplicativo, nao no banco), ate juntar 300 itens ou acabar a tabela (no maximo 20 lotes).
 */
export async function lerEmLotes<L, R>(
  buscar: (skip: number, take: number) => Promise<L[]>,
  filtrar: (linha: L) => Promise<R | null>,
  limite = 300,
): Promise<R[]> {
  const saida: R[] = [];
  for (let lote = 0; lote < 20 && saida.length < limite; lote++) {
    const linhas = await buscar(lote * 300, 300);
    for (const l of linhas) {
      const r = await filtrar(l);
      if (r !== null) saida.push(r);
      if (saida.length >= limite) break;
    }
    if (linhas.length < 300) break;
  }
  return saida;
}
