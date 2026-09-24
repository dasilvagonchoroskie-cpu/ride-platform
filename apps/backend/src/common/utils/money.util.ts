/** Todo dinheiro circula em centavos (inteiro). Nunca use float para dinheiro. */

export function toCents(value: number): number {
  return Math.round(value);
}

export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

export function applySurge(cents: number, multiplier: number): number {
  return Math.round(cents * multiplier);
}

export interface CommissionSplit {
  grossCents: number;
  commissionCents: number;
  driverEarningCents: number;
}

/** Divide o valor bruto entre plataforma e motorista. */
export function splitCommission(grossCents: number, commissionPercent: number): CommissionSplit {
  const commissionCents = percentOf(grossCents, commissionPercent);
  return {
    grossCents,
    commissionCents,
    driverEarningCents: grossCents - commissionCents,
  };
}

export function formatCentsToBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
