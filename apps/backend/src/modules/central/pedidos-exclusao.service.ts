import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';

/** Pedido feito na pagina publica de exclusao (exigencia da Google Play). */
export const ACAO_PEDIDO_EXCLUSAO = 'PEDIDO_EXCLUSAO_CONTA';
/** A Central atendeu o pedido (excluiu a conta ou nao achou conta). */
export const ACAO_PEDIDO_EXCLUSAO_RESOLVIDO = 'PEDIDO_EXCLUSAO_RESOLVIDO';

export type ComoResolveu = 'EXCLUIDA' | 'SEM_CONTA' | 'RESOLVIDO';

export interface PedidoDeExclusao {
  id: string;
  contato: string;
  motivo: string | null;
  createdAt: Date;
  teste: boolean;
  conta: { userId: string; nome: string | null; telefone: string | null; email: string | null; motorista: boolean } | null;
}

/**
 * Pedidos de exclusao de conta feitos pela pagina da internet (11/10/2026).
 *
 * Antes iam so por e-mail. Regra do Evandro (10/10/2026): tudo que espera a
 * Central tem que alarmar e aparecer nela. O pedido fica no audit_logs
 * (PEDIDO_EXCLUSAO_CONTA) e, quando a Central atende, entra outro registro
 * (PEDIDO_EXCLUSAO_RESOLVIDO) apontando para ele — nada e apagado do
 * historico.
 */
@Injectable()
export class PedidosExclusaoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pedidos ainda sem resposta, do mais velho para o mais novo, com a conta achada. */
  async pendentes(): Promise<PedidoDeExclusao[]> {
    const desde = new Date(Date.now() - 180 * 24 * 3600 * 1000);
    const [pedidos, resolvidos] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { action: ACAO_PEDIDO_EXCLUSAO, createdAt: { gte: desde } },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, after: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: { action: ACAO_PEDIDO_EXCLUSAO_RESOLVIDO, createdAt: { gte: desde } },
        select: { entityId: true },
      }),
    ]);
    const feitos = new Set(resolvidos.map((r) => r.entityId));
    const abertos = pedidos.filter((p) => !feitos.has(p.id));
    const saida: PedidoDeExclusao[] = [];
    for (const p of abertos) {
      const dados = (p.after ?? {}) as { contato?: string; motivo?: string | null; teste?: boolean };
      const contato = String(dados.contato ?? '').trim();
      saida.push({
        id: p.id,
        contato,
        motivo: dados.motivo ?? null,
        createdAt: p.createdAt,
        teste: dados.teste === true,
        conta: await this.acharConta(contato),
      });
    }
    return saida;
  }

  /** Quantos estao esperando e o mais novo (para o aviso da Central). */
  async resumo(): Promise<{ total: number; ultimo: { id: string; name: string; createdAt: Date } | null }> {
    const lista = await this.pendentes();
    const u = lista[lista.length - 1];
    return { total: lista.length, ultimo: u ? { id: u.id, name: u.conta?.nome || u.contato, createdAt: u.createdAt } : null };
  }

  async pedido(id: string): Promise<PedidoDeExclusao> {
    const p = (await this.pendentes()).find((x) => x.id === id);
    if (!p) throw BusinessException.notFound('Pedido nao encontrado ou ja atendido.');
    return p;
  }

  async marcarResolvido(id: string, adminId: string, como: ComoResolveu, observacao: string | null) {
    const p = await this.pedido(id);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: ACAO_PEDIDO_EXCLUSAO_RESOLVIDO,
        entity: 'audit_log',
        entityId: p.id,
        after: { como, observacao: observacao?.slice(0, 300) ?? null, contato: p.contato, userId: p.conta?.userId ?? null } as never,
      },
    });
    return { ok: true, como };
  }

  /** Conta ativa com aquele telefone ou e-mail (o que a pessoa digitou na pagina). */
  private async acharConta(contato: string): Promise<PedidoDeExclusao['conta']> {
    if (!contato) return null;
    const email = contato.includes('@') ? contato.toLowerCase() : null;
    const digitos = contato.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const telefone = !email && /^\d{10,11}$/.test(digitos) ? `+55${digitos}` : null;
    if (!email && !telefone) return null;
    const u = await this.prisma.user.findFirst({
      where: { deletedAt: null, ...(email ? { email } : { phone: telefone! }) },
      select: { id: true, name: true, phone: true, email: true, driver: { select: { id: true } } },
    });
    return u ? { userId: u.id, nome: u.name, telefone: u.phone, email: u.email, motorista: !!u.driver } : null;
  }
}
