import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UserRole } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { lerAvisos } from '../../modules/operacao/operacao.store';
import { PushService } from './push.service';

/** Notificacao mais velha que isto some sozinha (Evandro, 30/10/2026). */
export const DIAS_NA_CAIXA = 30;
const DIA = 24 * 60 * 60 * 1000;
/** Quantas a lista mostra de uma vez (as mais novas). */
export const MAX_NA_LISTA = 100;

/** Para onde o aplicativo leva quem toca na notificacao. */
export type DestinoDaNotificacao = 'carteira' | 'carros' | 'documentos' | 'dados' | 'saques';

export interface ItemDaCaixa {
  id: string;
  titulo: string;
  texto: string;
  /** aviso-central | conta | carro | categoria | documento | carteira | saque | dados */
  tipo: string;
  abrir: DestinoDaNotificacao | null;
  criadaEm: string;
  lida: boolean;
}

/** O minimo do Prisma que a caixa usa (facilita o teste sem banco). */
export type BancoDaCaixa = Pick<PrismaService, 'notification' | 'user' | 'setting' | 'driver' | '$executeRaw'>;

/**
 * Caixa de notificacoes de cada conta (o sino dos aplicativos).
 *
 * - Fica na tabela `notifications` (canal PUSH), sempre ligada a UMA conta:
 *   ler, marcar como lida e apagar so mexem nas da propria conta.
 * - Nao lidas sao contadas pelo servidor: o ponto vermelho nao volta
 *   sozinho depois de aberto (antes ele era calculado no celular).
 * - Avisos da Central para os passageiros (Configuracoes > Avisos) entram
 *   na caixa de cada passageiro na primeira vez que ele abre o app depois
 *   do aviso; apagado por ele, nao volta (marca em users.metadata.avisosAte).
 * - Mais de 30 dias: apagadas sozinhas (uma vez por hora).
 */
@Injectable()
export class CaixaDeEntradaService {
  private readonly logger = new Logger(CaixaDeEntradaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private get db(): BancoDaCaixa {
    return this.prisma;
  }

  /** Grava na caixa da conta e manda o push (se o Firebase estiver ligado). Nunca derruba quem chamou. */
  async avisar(
    userId: string,
    titulo: string,
    texto: string,
    extra: { tipo: string; abrir?: DestinoDaNotificacao | null },
  ): Promise<void> {
    try {
      const n = await this.db.notification.create({
        data: {
          userId,
          channel: 'PUSH',
          status: 'SENT',
          title: titulo.slice(0, 160),
          body: texto.slice(0, 500),
          data: { tipo: extra.tipo, ...(extra.abrir ? { abrir: extra.abrir } : {}) },
          sentAt: new Date(),
        },
        select: { id: true },
      });
      this.push.paraUsuario(userId, { tipo: 'aviso', titulo, texto, notificacao: n.id }, 3600);
    } catch (e) {
      this.logger.warn(`Notificacao nao gravada: ${(e as Error).message}`);
    }
  }

  /** Mesmo que `avisar`, achando a conta pelo cadastro de motorista. */
  async avisarMotorista(
    driverId: string,
    titulo: string,
    texto: string,
    extra: { tipo: string; abrir?: DestinoDaNotificacao | null },
  ): Promise<void> {
    try {
      const d = await this.db.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
      if (d) await this.avisar(d.userId, titulo, texto, extra);
    } catch (e) {
      this.logger.warn(`Notificacao do motorista nao gravada: ${(e as Error).message}`);
    }
  }

  private desde(agora = Date.now()): Date {
    return new Date(agora - DIAS_NA_CAIXA * DIA);
  }

  async listar(user: { id: string; role: UserRole | string }): Promise<{ itens: ItemDaCaixa[]; naoLidas: number }> {
    await this.trazerAvisosDaCentral(user);
    const itens = await this.db.notification.findMany({
      where: { userId: user.id, channel: 'PUSH', createdAt: { gte: this.desde() } },
      orderBy: { createdAt: 'desc' },
      take: MAX_NA_LISTA,
      select: { id: true, title: true, body: true, data: true, createdAt: true, readAt: true },
    });
    return {
      itens: itens.map((n) => {
        const d = (n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? n.data : {}) as { tipo?: unknown; abrir?: unknown };
        return {
          id: n.id,
          titulo: n.title,
          texto: n.body,
          tipo: typeof d.tipo === 'string' ? d.tipo : 'aviso',
          abrir: typeof d.abrir === 'string' ? (d.abrir as DestinoDaNotificacao) : null,
          criadaEm: n.createdAt.toISOString(),
          lida: n.readAt != null,
        };
      }),
      naoLidas: await this.contarNaoLidas(user.id),
    };
  }

  /** So o numero (o aplicativo pergunta de tempos em tempos para o ponto vermelho). */
  async naoLidas(user: { id: string; role: UserRole | string }): Promise<{ naoLidas: number }> {
    await this.trazerAvisosDaCentral(user);
    return { naoLidas: await this.contarNaoLidas(user.id) };
  }

  private contarNaoLidas(userId: string): Promise<number> {
    return this.db.notification.count({
      where: { userId, channel: 'PUSH', readAt: null, createdAt: { gte: this.desde() } },
    });
  }

  /** Marca como lidas (todas, ou so as `ids`) — so as da propria conta. */
  async marcarLidas(userId: string, ids?: string[]): Promise<{ naoLidas: number }> {
    await this.db.notification.updateMany({
      where: { userId, channel: 'PUSH', readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { naoLidas: await this.contarNaoLidas(userId) };
  }

  /**
   * Apaga da conta: so as `ids` (o "Apagar todas" manda as que a pessoa viu,
   * para nao levar junto uma que acabou de chegar) ou, sem `ids`, todas.
   * Uma notificacao de outra conta nunca e apagada (conta 0).
   */
  async apagar(userId: string, ids?: string[]): Promise<{ apagadas: number; naoLidas: number }> {
    const r = await this.db.notification.deleteMany({
      where: { userId, channel: 'PUSH', ...(ids ? { id: { in: ids } } : {}) },
    });
    return { apagadas: r.count, naoLidas: await this.contarNaoLidas(userId) };
  }

  /** A Central tirou um aviso: some tambem da caixa de quem ja tinha recebido. */
  async tirarAvisoDaCentral(avisoId: string): Promise<number> {
    const r = await this.db.notification.deleteMany({ where: { channel: 'PUSH', data: { path: ['avisoId'], equals: avisoId } } });
    return r.count;
  }

  /**
   * Avisos publicados pela Central para os passageiros entram na caixa de
   * cada um, uma vez so. A marca (data do ultimo aviso trazido) troca no
   * banco numa conta so: dois pedidos ao mesmo tempo nao trazem em dobro.
   */
  async trazerAvisosDaCentral(user: { id: string; role: UserRole | string }, agora = Date.now()): Promise<number> {
    if (user.role !== UserRole.PASSENGER) return 0;
    try {
      const avisos = await lerAvisos(this.db as never);
      if (!avisos.length) return 0;
      const u = await this.db.user.findUnique({ where: { id: user.id }, select: { metadata: true } });
      const meta = (u?.metadata && typeof u.metadata === 'object' && !Array.isArray(u.metadata) ? u.metadata : {}) as { avisosAte?: unknown };
      const ate = typeof meta.avisosAte === 'string' ? meta.avisosAte : null;
      const desde = Math.max(ate ? Date.parse(ate) || 0 : 0, this.desde(agora).getTime() - 1);
      const novos = avisos.filter((a) => (Date.parse(a.criadoEm) || 0) > desde);
      if (!novos.length) return 0;
      const novoAte = novos.map((a) => a.criadoEm).sort().at(-1)!;
      const trocou = await this.db.$executeRaw`
        UPDATE users
           SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{avisosAte}', to_jsonb(${novoAte}::text))
         WHERE id = ${user.id}::uuid
           AND COALESCE(metadata->>'avisosAte', '') = ${ate ?? ''}`;
      if (!trocou) return 0;
      // Nao repete um aviso que ja esta na caixa (marca perdida por outra gravacao).
      const ja = await this.db.notification.findMany({
        where: { userId: user.id, channel: 'PUSH', OR: novos.map((a) => ({ data: { path: ['avisoId'], equals: a.id } })) },
        select: { data: true },
      });
      const tem = new Set(ja.map((n) => (n.data as { avisoId?: string } | null)?.avisoId));
      const faltam = novos.filter((a) => !tem.has(a.id));
      if (!faltam.length) return 0;
      await this.db.notification.createMany({
        data: faltam.map((a) => ({
          userId: user.id,
          channel: 'PUSH' as const,
          status: 'SENT' as const,
          title: a.titulo.slice(0, 160),
          body: a.texto.slice(0, 500),
          data: { tipo: 'aviso-central', avisoId: a.id },
          sentAt: new Date(a.criadoEm),
          createdAt: new Date(a.criadoEm),
        })),
      });
      return faltam.length;
    } catch (e) {
      this.logger.warn(`Avisos da Central na caixa: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Uma vez por hora: some o que tem mais de 30 dias (todas as contas). */
  private ultimaLimpeza = 0;
  @Interval(10 * 60_000)
  async limparAntigas(agora = Date.now()): Promise<number> {
    if (agora - this.ultimaLimpeza < 60 * 60_000) return 0;
    this.ultimaLimpeza = agora;
    try {
      const r = await this.db.notification.deleteMany({ where: { createdAt: { lt: this.desde(agora) } } });
      if (r.count) this.logger.log(`Caixa de notificacoes: ${r.count} com mais de ${DIAS_NA_CAIXA} dias apagadas.`);
      return r.count;
    } catch (e) {
      this.logger.warn(`Limpeza da caixa: ${(e as Error).message}`);
      return 0;
    }
  }
}
