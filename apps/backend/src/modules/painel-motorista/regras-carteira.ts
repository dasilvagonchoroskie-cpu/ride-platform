import type { PrismaClient, Prisma } from '@prisma/client';

type Banco = PrismaClient | Prisma.TransactionClient;

export const CHAVE_MINIMO = 'carteira.minimoCents';
export const CHAVE_BLOQUEAR = 'carteira.bloquearSemSaldo';
export const MINIMO_PADRAO_CENTS = 200;

/**
 * Regras da carteira pre-paga, configuradas pela Central.
 * - minimoCents: saldo minimo para continuar recebendo corridas.
 * - bloquear: se ligado, quem esta abaixo do minimo nao recebe chamados.
 *   Comeca DESLIGADO: a Central liga quando todos ja tiverem recarregado.
 */
export async function regrasDaCarteira(db: Banco): Promise<{ minimoCents: number; bloquear: boolean }> {
  const lista = await db.setting.findMany({ where: { key: { in: [CHAVE_MINIMO, CHAVE_BLOQUEAR] } } });
  const valor = (k: string) => lista.find((s) => s.key === k)?.value;
  const minimo = valor(CHAVE_MINIMO);
  const bloquear = valor(CHAVE_BLOQUEAR);
  return {
    minimoCents: typeof minimo === 'number' ? minimo : MINIMO_PADRAO_CENTS,
    bloquear: bloquear === true,
  };
}
