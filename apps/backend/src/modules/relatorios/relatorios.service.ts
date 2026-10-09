import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, RideStatus } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { gerarPdf } from './relatorio-pdf';
import type { DadosDoRelatorio, LinhaCorrida, LinhaMotorista } from './relatorio-pdf';

const FUSO_MS = 3 * 3_600_000;
const DIA_MS = 24 * 3_600_000;
const MAX_LINHAS = 1000;

/** Quem o relatorio cobre. */
export interface PedidoDeRelatorio {
  tipo: 'motorista' | 'praca' | 'frota';
  driverId?: string;
  praca?: string;
  /** "AAAA-MM-DD" (dias de Brasilia, inclusive). */
  de: string;
  ate: string;
}

const NOME_FORMA: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  WALLET: 'Carteira do app',
};

/**
 * Relatorio de faturamento em PDF — motorista (o dele), e a Central (por
 * motorista, por cidade e a frota toda).
 *
 * O aplicativo pede um LINK assinado (vale 15 minutos) e abre no navegador
 * do celular, que mostra o PDF e deixa salvar ou compartilhar. Assim nao e
 * preciso instalar nada a mais no aplicativo.
 */
@Injectable()
export class RelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pracas: PracasService,
    private readonly config: AppConfigService,
  ) {}

  // ------------------------------------------------------------------
  // Link assinado
  // ------------------------------------------------------------------

  private segredo(): string {
    return `relatorio:${this.config.jwt.accessSecret}`;
  }

  link(pedido: PedidoDeRelatorio): { caminho: string; validoAte: string; arquivo: string } {
    this.periodo(pedido.de, pedido.ate); // valida antes de assinar
    const exp = Date.now() + 15 * 60_000;
    const corpo = Buffer.from(JSON.stringify({ ...pedido, x: exp })).toString('base64url');
    const assinatura = createHmac('sha256', this.segredo()).update(corpo).digest('base64url');
    const arquivo = `relatorio-${pedido.tipo}-${pedido.de}-a-${pedido.ate}.pdf`;
    return { caminho: `/api/relatorios/${corpo}.${assinatura}/${arquivo}`, validoAte: new Date(exp).toISOString(), arquivo };
  }

  lerLink(token: string): PedidoDeRelatorio {
    const [corpo, assinatura] = token.split('.');
    if (!corpo || !assinatura) throw BusinessException.forbidden('Link de relatorio invalido.');
    const certa = createHmac('sha256', this.segredo()).update(corpo).digest();
    const veio = Buffer.from(assinatura, 'base64url');
    if (veio.length !== certa.length || !timingSafeEqual(veio, certa)) throw BusinessException.forbidden('Link de relatorio invalido.');
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as PedidoDeRelatorio & { x: number };
    if (!p.x || Date.now() > p.x) throw BusinessException.forbidden('Este link venceu. Gere o relatorio de novo no aplicativo.');
    return p;
  }

  // ------------------------------------------------------------------
  // Periodo
  // ------------------------------------------------------------------

  /** De "AAAA-MM-DD" a "AAAA-MM-DD" (Brasilia) -> instantes [de, ate). */
  periodo(de: string, ate: string): { inicio: Date; fim: Date } {
    const ler = (t: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      if (!m) throw BusinessException.validation('Data invalida (use AAAA-MM-DD).');
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + FUSO_MS);
    };
    const inicio = ler(de);
    const fim = new Date(ler(ate).getTime() + DIA_MS);
    if (fim <= inicio) throw BusinessException.validation('A data final vem antes da inicial.');
    if (fim.getTime() - inicio.getTime() > 400 * DIA_MS) throw BusinessException.validation('Escolha um periodo de ate 1 ano.');
    return { inicio, fim };
  }

  // ------------------------------------------------------------------
  // Dados e PDF
  // ------------------------------------------------------------------

  async pdf(pedido: PedidoDeRelatorio): Promise<Buffer> {
    return gerarPdf(await this.dados(pedido));
  }

  async dados(pedido: PedidoDeRelatorio): Promise<DadosDoRelatorio> {
    const { inicio, fim } = this.periodo(pedido.de, pedido.ate);
    const pracas = await this.pracas.listar();
    const mapa = await this.pracas.mapaDeMotoristas();
    const nomeDaPraca = (id: string | null | undefined) => (id ? (pracas.find((p) => p.id === id)?.nome ?? id) : null);

    let onde: Prisma.RideWhereInput = {};
    let quem = 'Frota toda';
    let detalheQuem: string | undefined = `${pracas.length} cidade(s): ${pracas.map((p) => `${p.nome}-${p.uf}`).join(', ')}`;
    let titulo = 'Relatório de faturamento da frota';
    let motorista: { id: string; nome: string; telefone: string; cpf: string | null } | null = null;

    if (pedido.tipo === 'motorista') {
      if (!pedido.driverId) throw BusinessException.validation('Escolha o motorista.');
      const d = await this.prisma.driver.findUnique({
        where: { id: pedido.driverId },
        select: { id: true, cpf: true, user: { select: { name: true, phone: true } }, vehicles: { where: { isActive: true }, take: 1 } },
      });
      if (!d) throw BusinessException.notFound('Motorista nao encontrado.');
      motorista = { id: d.id, nome: d.user.name, telefone: d.user.phone, cpf: d.cpf };
      onde = { driverId: d.id };
      quem = d.user.name;
      const carro = d.vehicles[0];
      detalheQuem = [
        telefoneBonito(d.user.phone),
        d.cpf ? `CPF ${cpfBonito(d.cpf)}` : null,
        carro ? `${carro.brand} ${carro.model} - placa ${carro.plate}` : null,
        nomeDaPraca(mapa.get(d.id)) ? `Cidade: ${nomeDaPraca(mapa.get(d.id))}` : null,
      ]
        .filter(Boolean)
        .join('   |   ');
      titulo = 'Relatório de faturamento do motorista';
    } else if (pedido.tipo === 'praca') {
      const p = await this.pracas.buscar(pedido.praca);
      if (!p) throw BusinessException.validation('Cidade nao encontrada.');
      onde = await this.pracas.ondeCorridas(p.id);
      quem = `${p.nome} - ${p.uf}`;
      detalheQuem = 'Corridas com embarque nesta cidade';
      titulo = 'Relatório de faturamento da cidade';
    }

    const concluidas = await this.prisma.ride.findMany({
      where: { status: RideStatus.COMPLETED, finishedAt: { gte: inicio, lt: fim }, ...onde },
      orderBy: { finishedAt: 'asc' },
      select: {
        id: true,
        code: true,
        finishedAt: true,
        pickupAddress: true,
        dropoffAddress: true,
        distanceMeters: true,
        paymentMethodType: true,
        finalFareCents: true,
        estimatedFareCents: true,
        discountCents: true,
        commissionCents: true,
        driverEarningCents: true,
        driverId: true,
        driver: { select: { user: { select: { name: true, phone: true } } } },
      },
    });
    const canceladas = await this.prisma.ride.count({
      where: { cancelledAt: { gte: inicio, lt: fim }, status: { not: RideStatus.EXPIRED }, ...onde },
    });

    const valor = (c: (typeof concluidas)[number]) => c.finalFareCents ?? c.estimatedFareCents;
    const totais = { corridas: concluidas.length, canceladas, valorCents: 0, descontoCents: 0, comissaoCents: 0, liquidoCents: 0, metros: 0 };
    const formas = new Map<string, { corridas: number; valorCents: number }>();
    const porMotorista = new Map<string, LinhaMotorista>();
    for (const c of concluidas) {
      totais.valorCents += valor(c);
      totais.descontoCents += c.discountCents;
      totais.comissaoCents += c.commissionCents;
      totais.liquidoCents += c.driverEarningCents;
      totais.metros += c.distanceMeters;
      const f = NOME_FORMA[c.paymentMethodType] ?? c.paymentMethodType;
      const fa = formas.get(f) ?? { corridas: 0, valorCents: 0 };
      fa.corridas += 1;
      fa.valorCents += valor(c);
      formas.set(f, fa);
      if (pedido.tipo !== 'motorista') {
        const chave = c.driverId ?? 'sem';
        const m = porMotorista.get(chave) ?? {
          nome: c.driver?.user.name ?? 'Motorista excluído',
          telefone: c.driver ? telefoneBonito(c.driver.user.phone) : '',
          cidade: nomeDaPraca(c.driverId ? mapa.get(c.driverId) : null),
          corridas: 0,
          valorCents: 0,
          comissaoCents: 0,
          liquidoCents: 0,
        };
        m.corridas += 1;
        m.valorCents += valor(c);
        m.comissaoCents += c.commissionCents;
        m.liquidoCents += c.driverEarningCents;
        porMotorista.set(chave, m);
      }
    }

    const corridas: LinhaCorrida[] = concluidas.slice(0, MAX_LINHAS).map((c) => ({
      quando: c.finishedAt ?? inicio,
      codigo: c.code,
      embarque: curto(c.pickupAddress),
      destino: curto(c.dropoffAddress),
      metros: c.distanceMeters,
      forma: NOME_FORMA[c.paymentMethodType] ?? c.paymentMethodType,
      valorCents: valor(c),
      descontoCents: c.discountCents,
      comissaoCents: c.commissionCents,
      liquidoCents: c.driverEarningCents,
      ...(pedido.tipo === 'motorista' ? {} : { motorista: c.driver?.user.name ?? '-' }),
    }));

    let carteira: DadosDoRelatorio['carteira'];
    if (motorista) {
      const w = await this.prisma.wallet.findUnique({ where: { driverId: motorista.id } });
      if (w) {
        const movs = await this.prisma.walletTransaction.groupBy({
          by: ['type'],
          where: { walletId: w.id, createdAt: { gte: inicio, lt: fim } },
          _sum: { amountCents: true },
        });
        const recargas = await this.prisma.walletTransaction.aggregate({
          where: { walletId: w.id, createdAt: { gte: inicio, lt: fim }, type: 'ADJUSTMENT', amountCents: { gt: 0 } },
          _sum: { amountCents: true },
        });
        const soma = (t: string) => movs.find((m) => m.type === t)?._sum.amountCents ?? 0;
        carteira = {
          recargasCents: recargas._sum.amountCents ?? 0,
          comissoesCents: Math.abs(soma('COMMISSION')),
          bonusCents: soma('BONUS'),
          saquesCents: Math.abs(soma('PAYOUT')),
          saldoAtualCents: w.balanceCents,
        };
      }
    }

    return {
      titulo,
      quem,
      detalheQuem,
      de: inicio,
      ate: new Date(fim.getTime() - 1),
      geradoEm: new Date(),
      totais,
      porForma: [...formas.entries()].map(([forma, v]) => ({ forma, ...v })).sort((a, b) => b.valorCents - a.valorCents),
      carteira,
      motoristas: pedido.tipo === 'motorista' ? undefined : [...porMotorista.values()].sort((a, b) => b.valorCents - a.valorCents),
      corridas,
      corridasOmitidas: Math.max(0, concluidas.length - MAX_LINHAS),
    };
  }

  /** Motorista do usuario logado (o token antigo pode nao trazer o driverId). */
  async motoristaDo(user: { id: string; driverId?: string | null }): Promise<string> {
    if (user.driverId) return user.driverId;
    const d = await this.prisma.driver.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!d) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');
    return d.id;
  }
}

function curto(endereco: string): string {
  const t = endereco.replace(/\s+/g, ' ').trim();
  return t.length > 70 ? `${t.slice(0, 67)}...` : t;
}

function telefoneBonito(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t.startsWith('pend-') || t.startsWith('excl-') ? '' : t;
}

function cpfBonito(c: string): string {
  return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;
}
