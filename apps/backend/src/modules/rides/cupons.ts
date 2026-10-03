import { Coupon, Prisma, RideStatus } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';

/**
 * Cupom de desconto.
 *
 * Regra do negocio (o dinheiro nao passa pela plataforma): o passageiro
 * paga ao motorista o valor JA com desconto, e a plataforma devolve o
 * desconto ao motorista como credito na carteira pre-paga. Assim o
 * motorista nunca perde por causa de um cupom.
 */
export type DbCupons = Pick<Prisma.TransactionClient, 'coupon' | 'ride'>;

/** Corridas que "seguram" o cupom (canceladas e sem motorista nao contam). */
const USOS_QUE_CONTAM: RideStatus[] = [
  'SCHEDULED',
  'REQUESTED',
  'SEARCHING',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_WAITING',
  'IN_PROGRESS',
  'COMPLETED',
];

export function descontoDoCupom(cupom: Pick<Coupon, 'discountType' | 'discountValue' | 'maxDiscountCents'>, valorCents: number): number {
  let d =
    cupom.discountType === 'PERCENT'
      ? Math.round((valorCents * Math.min(Math.max(cupom.discountValue, 0), 100)) / 100)
      : Math.max(cupom.discountValue, 0);
  if (cupom.maxDiscountCents != null) d = Math.min(d, cupom.maxDiscountCents);
  return Math.max(0, Math.min(d, valorCents));
}

function reais(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** Confere o cupom para este passageiro e este valor. Lanca o motivo se nao valer. */
export async function validarCupom(
  db: DbCupons,
  passengerId: string,
  codigo: string,
  valorCents: number,
  ignorarCorridaId?: string,
): Promise<{ cupom: Coupon; descontoCents: number }> {
  const cupom = await db.coupon.findUnique({ where: { code: codigo.trim().toUpperCase() } });
  const agora = new Date();
  if (!cupom || !cupom.isActive) throw BusinessException.validation('Cupom não encontrado.');
  if (cupom.startsAt > agora) throw BusinessException.validation('Este cupom ainda não começou a valer.');
  if (cupom.expiresAt && cupom.expiresAt < agora) throw BusinessException.validation('Este cupom venceu.');
  if (cupom.usedCount >= cupom.maxUses) throw BusinessException.validation('Este cupom já se esgotou.');
  if (valorCents < cupom.minFareCents) {
    throw BusinessException.validation(`Este cupom vale para corridas a partir de ${reais(cupom.minFareCents)}.`);
  }
  const meusUsos = await db.ride.count({
    where: {
      passengerId,
      couponId: cupom.id,
      status: { in: USOS_QUE_CONTAM },
      ...(ignorarCorridaId ? { NOT: { id: ignorarCorridaId } } : {}),
    },
  });
  if (meusUsos >= cupom.maxUsesPerUser) throw BusinessException.validation('Você já usou este cupom.');
  return { cupom, descontoCents: descontoDoCupom(cupom, valorCents) };
}

/** Cupons que este passageiro ainda pode usar (tela Cupons). */
export async function cuponsDisponiveis(db: DbCupons, passengerId: string) {
  const agora = new Date();
  const ativos = await db.coupon.findMany({
    where: {
      isActive: true,
      startsAt: { lte: agora },
      OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const saida = [];
  for (const c of ativos) {
    if (c.usedCount >= c.maxUses) continue;
    const meus = await db.ride.count({
      where: { passengerId, couponId: c.id, status: { in: USOS_QUE_CONTAM } },
    });
    if (meus >= c.maxUsesPerUser) continue;
    saida.push({
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscountCents: c.maxDiscountCents,
      minFareCents: c.minFareCents,
      expiresAt: c.expiresAt,
    });
  }
  return saida;
}
