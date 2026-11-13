import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CaixaDeEntradaService } from '../../integrations/notifications/caixa-de-entrada.service';
import { PrismaService } from '../../database/prisma.service';
import { etapaDaEntrega, type Acao, type Etapa } from './comercio.regras';

/**
 * Avisos do Comercio (13/11/2026). Usa a caixa de notificacoes que a
 * plataforma ja tem (o "sino": CaixaDeEntradaService) — nao cria canal novo,
 * nao usa servico externo e nao tem custo. Cada aviso vai SO para a conta da
 * loja dona do cadastro/pedido. O push no celular (Firebase) sai pelo mesmo
 * caminho, mas so existe quando o app tiver Firebase configurado (dependencia
 * externa: ver docs/COMERCIO.md).
 *
 * Nenhum aviso leva telefone do motorista, CNPJ, CPF ou valores: so o
 * necessario para a loja saber em que pe esta.
 */

export interface TextoDeAviso {
  titulo: string;
  texto: string;
  tipo: 'comercio-cadastro' | 'comercio-decisao' | 'comercio-entrega';
}

export function avisoDoCadastro(nome: string): TextoDeAviso {
  return {
    tipo: 'comercio-cadastro',
    titulo: 'Cadastro recebido',
    texto: `Recebemos o cadastro de ${nome}. A Central vai analisar e você será avisado aqui quando houver uma decisão.`,
  };
}

export function avisoDaDecisao(acao: Acao, nome: string, motivo?: string | null): TextoDeAviso {
  const m = (motivo ?? '').trim();
  const comMotivo = m ? ` Motivo: ${m}` : '';
  switch (acao) {
    case 'APROVAR':
      return { tipo: 'comercio-decisao', titulo: 'Cadastro aprovado', texto: `${nome} foi aprovado pela Central. O pedido de entregas depende de a Central liberar as entregas do Comércio.` };
    case 'REJEITAR':
      return { tipo: 'comercio-decisao', titulo: 'Cadastro não aprovado', texto: `O cadastro de ${nome} não foi aprovado.${comMotivo}` };
    case 'SUSPENDER':
      return { tipo: 'comercio-decisao', titulo: 'Estabelecimento suspenso', texto: `${nome} foi suspenso e não pode pedir entregas.${comMotivo}` };
    case 'REATIVAR':
      return { tipo: 'comercio-decisao', titulo: 'Estabelecimento reativado', texto: `${nome} foi reativado e voltou a poder usar o aplicativo.` };
  }
}

/** Etapas que viram aviso (as demais, como "criada", a loja ja ve na hora). */
const MARCOS: Partial<Record<Etapa, (motorista: string) => { titulo: string; texto: string }>> = {
  MOTORISTA_ENCONTRADO: (m) => ({ titulo: 'Entrega aceita', texto: `${m} aceitou a entrega.` }),
  A_CAMINHO_DA_COLETA: (m) => ({ titulo: 'Motorista a caminho', texto: `${m} está indo até a loja buscar a encomenda.` }),
  NO_ESTABELECIMENTO: (m) => ({ titulo: 'Motorista chegou à loja', texto: `${m} chegou para buscar a encomenda.` }),
  COLETADA: () => ({ titulo: 'Encomenda coletada', texto: 'O motorista pegou a encomenda e vai levá-la a quem recebe.' }),
  A_CAMINHO_DA_ENTREGA: () => ({ titulo: 'Encomenda coletada', texto: 'O motorista pegou a encomenda e está indo entregar.' }),
  ENTREGUE: () => ({ titulo: 'Entrega concluída', texto: 'A encomenda foi entregue.' }),
  CANCELADA: () => ({ titulo: 'Entrega cancelada', texto: 'A entrega foi cancelada. Veja os detalhes no histórico.' }),
  FALHA_NA_ENTREGA: () => ({ titulo: 'Problema na entrega', texto: 'A entrega não foi concluída. Veja os detalhes no histórico.' }),
  SEM_MOTORISTA: () => ({ titulo: 'Nenhum motorista aceitou', texto: 'Nenhum motorista aceitou a entrega e nada foi cobrado. Você pode pedir de novo.' }),
};

export function avisoDaEtapa(etapa: Etapa, motorista?: string | null): (TextoDeAviso & { chaveDaEtapa: Etapa }) | null {
  const f = MARCOS[etapa];
  if (!f) return null;
  const { titulo, texto } = f(motorista?.trim() || 'O motorista');
  return { tipo: 'comercio-entrega', titulo, texto, chaveDaEtapa: etapa };
}

/** A chave de nao-repeticao: o mesmo marco da mesma entrega avisa uma vez so. */
export const chaveDoAviso = (rideId: string, etapa: Etapa): string => `${rideId}:${marcoDoAviso(etapa)}`;

/** "Coletada" e "a caminho da entrega" sao o mesmo marco para a loja: um aviso so (auditoria 13/11). */
const marcoDoAviso = (etapa: Etapa): Etapa => (etapa === 'A_CAMINHO_DA_ENTREGA' ? 'COLETADA' : etapa);

const ABERTAS = ['SCHEDULED', 'REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'];
/** Pedido que acabou ha menos disto ainda e conferido (pega o aviso final). */
const JANELA_FINAIS_MS = 30 * 60_000;

@Injectable()
export class ComercioAvisosService {
  private readonly logger = new Logger(ComercioAvisosService.name);
  /** Marcos ja avisados por este processo (a conferencia no banco vale mesmo assim). */
  private readonly avisados = new Set<string>();
  private sincronizando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly caixa: CaixaDeEntradaService,
  ) {}

  /** O aviso nunca derruba quem chamou: o cadastro e a decisao ja foram gravados. */
  async cadastroRecebido(userId: string, nome: string): Promise<void> {
    const a = avisoDoCadastro(nome);
    await this.caixa.avisar(userId, a.titulo, a.texto, { tipo: a.tipo }).catch((e: Error) => this.logger.warn(`Aviso do cadastro nao gravado: ${e.message}`));
  }

  async decisao(userId: string, acao: Acao, nome: string, motivo?: string | null): Promise<void> {
    const a = avisoDaDecisao(acao, nome, motivo);
    await this.caixa.avisar(userId, a.titulo, a.texto, { tipo: a.tipo }).catch((e: Error) => this.logger.warn(`Aviso da decisao nao gravado: ${e.message}`));
  }

  /**
   * Avisa o marco em que a entrega esta AGORA, se ainda nao avisou. Chamado
   * pela conferencia periodica (pega tambem cancelamento do sistema e
   * "ninguem aceitou", que nao passam por nenhuma tela) e quando a loja abre
   * o acompanhamento.
   */
  async deEntrega(donoDaLojaId: string, rideId: string, etapa: Etapa, motorista?: string | null): Promise<boolean> {
    const a = avisoDaEtapa(etapa, motorista);
    if (!a) return false;
    const chave = chaveDoAviso(rideId, etapa);
    if (this.avisados.has(chave)) return false;
    try {
      const ja = await this.prisma.notification.findFirst({
        where: { userId: donoDaLojaId, channel: 'PUSH', data: { path: ['chave'], equals: chave } },
        select: { id: true },
      });
      if (ja) {
        this.avisados.add(chave);
        return false;
      }
      this.avisados.add(chave);
      await this.caixa.avisar(donoDaLojaId, a.titulo, a.texto, { tipo: a.tipo, dados: { chave, rideId, etapa } });
      return true;
    } catch (e) {
      this.avisados.delete(chave);
      this.logger.warn(`Aviso da entrega nao gravado: ${(e as Error).message}`);
      return false;
    }
  }

  /** A cada 20 s: confere os pedidos abertos (e os que acabaram ha pouco) e avisa o que mudou. */
  @Interval(20_000)
  async sincronizar(agora = Date.now()): Promise<number> {
    if (this.sincronizando) return 0;
    this.sincronizando = true;
    let enviados = 0;
    try {
      const pedidos = await this.prisma.comercioPedido.findMany({
        where: {
          ride: { OR: [{ status: { in: ABERTAS as never } }, { updatedAt: { gte: new Date(agora - JANELA_FINAIS_MS) } }] },
        },
        take: 300,
        orderBy: { createdAt: 'desc' },
        select: {
          rideId: true,
          comercio: { select: { userId: true } },
          ride: {
            select: {
              status: true,
              entrega: { select: { coletadaEm: true, entregueEm: true } },
              driver: { select: { user: { select: { name: true } } } },
            },
          },
        },
      });
      for (const p of pedidos) {
        const etapa = etapaDaEntrega({ status: p.ride.status, coletadaEm: p.ride.entrega?.coletadaEm, entregueEm: p.ride.entrega?.entregueEm });
        const primeiro = p.ride.driver?.user?.name?.split(' ')[0] ?? null;
        if (await this.deEntrega(p.comercio.userId, p.rideId, etapa, primeiro)) enviados++;
      }
    } catch (e) {
      this.logger.warn(`Conferencia dos avisos do Comercio: ${(e as Error).message}`);
    } finally {
      this.sincronizando = false;
    }
    return enviados;
  }
}
