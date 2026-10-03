import type { PrismaClient, Prisma } from '@prisma/client';

type Banco = PrismaClient | Prisma.TransactionClient;

export const CHAVE_MINIMO = 'carteira.minimoCents';
export const CHAVE_BLOQUEAR = 'carteira.bloquearSemSaldo';
export const MINIMO_PADRAO_CENTS = 0;

/**
 * Regras da carteira pre-paga, configuradas pela Central.
 * - minimoCents: saldo minimo para continuar recebendo corridas.
 * - bloquear: se ligado, quem tem saldo IGUAL OU MENOR que o minimo nao
 *   recebe chamados (nem consegue ficar disponivel) ate recarregar.
 *   Comeca LIGADO (pedido do Evandro em 03/10/2026); a Central pode desligar.
 */
export async function regrasDaCarteira(db: Banco): Promise<{ minimoCents: number; bloquear: boolean }> {
  const lista = await db.setting.findMany({ where: { key: { in: [CHAVE_MINIMO, CHAVE_BLOQUEAR] } } });
  const valor = (k: string) => lista.find((s) => s.key === k)?.value;
  const minimo = valor(CHAVE_MINIMO);
  const bloquear = valor(CHAVE_BLOQUEAR);
  return {
    minimoCents: typeof minimo === 'number' ? minimo : MINIMO_PADRAO_CENTS,
    bloquear: bloquear !== false,
  };
}

/** Saldo que nao da direito a receber corridas (igual ou abaixo do minimo). */
export function semSaldo(saldoCents: number, minimoCents: number): boolean {
  return saldoCents <= minimoCents;
}
