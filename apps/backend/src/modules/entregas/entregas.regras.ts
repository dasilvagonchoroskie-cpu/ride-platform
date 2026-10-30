import type { Prisma } from '@prisma/client';

/**
 * Entregas de encomendas — Fase 1 (Evandro, 30/10/2026).
 *
 * - DESLIGADA em todas as cidades ate a Central ligar (por cidade e por tipo
 *   de veiculo: carro, moto ou os dois).
 * - Tarifa propria: a categoria ENTREGA (bandeirada, km incluso, valor por
 *   km, minima e comissao), editavel em Tarifas, por cidade. Nunca aparece
 *   como opcao de corrida para o passageiro nem como categoria de carro.
 * - O resto e a corrida de sempre: coleta = embarque, entrega = destino,
 *   pagamento direto ao motorista e comissao pela carteira pre-paga.
 */

type Db = Pick<Prisma.TransactionClient, 'setting'>;

export const CODIGO_ENTREGA = 'ENTREGA';
export const CHAVE_ENTREGAS = 'entregas.config';
export const VEICULOS = ['CARRO', 'MOTO', 'TODOS'] as const;
export type VeiculosDaEntrega = (typeof VEICULOS)[number];

export interface EntregaNaCidade {
  ligada: boolean;
  veiculos: VeiculosDaEntrega;
}

export interface ConfigDeEntregas {
  porCidade: Record<string, EntregaNaCidade>;
}

/** Sem nada gravado: desligada (Evandro: "fica DESLIGADA em todas as cidades por padrao"). */
export const DESLIGADA: EntregaNaCidade = { ligada: false, veiculos: 'TODOS' };

export function ehEntrega(categoria: string | null | undefined): boolean {
  return (categoria ?? '').toUpperCase() === CODIGO_ENTREGA;
}

export async function lerConfigDeEntregas(db: Db): Promise<ConfigDeEntregas> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_ENTREGAS } });
  const v = (s?.value && typeof s.value === 'object' && !Array.isArray(s.value) ? s.value : {}) as { porCidade?: unknown };
  const porCidade: Record<string, EntregaNaCidade> = {};
  if (v.porCidade && typeof v.porCidade === 'object') {
    for (const [praca, c] of Object.entries(v.porCidade as Record<string, unknown>)) {
      const x = (c ?? {}) as Partial<EntregaNaCidade>;
      porCidade[praca] = {
        ligada: x.ligada === true,
        veiculos: VEICULOS.includes(x.veiculos as VeiculosDaEntrega) ? (x.veiculos as VeiculosDaEntrega) : 'TODOS',
      };
    }
  }
  return { porCidade };
}

export function entregaNaCidade(cfg: ConfigDeEntregas, praca: string | null | undefined): EntregaNaCidade {
  return (praca && cfg.porCidade[praca]) || DESLIGADA;
}

export async function gravarEntregaNaCidade(db: Db, praca: string, c: EntregaNaCidade, adminId: string): Promise<ConfigDeEntregas> {
  const cfg = await lerConfigDeEntregas(db);
  cfg.porCidade[praca] = { ligada: c.ligada, veiculos: c.veiculos };
  await db.setting.upsert({
    where: { key: CHAVE_ENTREGAS },
    update: { value: cfg as never, updatedBy: adminId },
    create: { key: CHAVE_ENTREGAS, value: cfg as never, updatedBy: adminId, description: 'Entregas de encomendas: ligada e veiculos por cidade' },
  });
  return cfg;
}

/** O carro (ou moto) desta categoria pode levar a entrega? MOTO = categoria com "MOTO". */
export function veiculoServe(veiculos: VeiculosDaEntrega, categoriaDoCarro: string): boolean {
  const moto = categoriaDoCarro.toUpperCase().includes('MOTO');
  return veiculos === 'TODOS' || (veiculos === 'MOTO' ? moto : !moto);
}

/** Telefone de quem recebe: so numeros, com DDD (55 na frente se faltar). */
export function telefoneDeQuemRecebe(t: string): string {
  const d = t.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export const MAX_TENTATIVAS_CODIGO = 5;

/** Confere o codigo digitado pelo motorista. */
export function conferirCodigo(
  entrega: { codigo: string; tentativas: number },
  digitado: string | null | undefined,
): { ok: true } | { ok: false; motivo: string; bloqueada: boolean } {
  if (entrega.tentativas >= MAX_TENTATIVAS_CODIGO) {
    return { ok: false, bloqueada: true, motivo: 'Muitas tentativas com o código errado. Fale com a Central para encerrar a entrega.' };
  }
  const limpo = (digitado ?? '').replace(/\D/g, '');
  if (limpo.length !== 4) return { ok: false, bloqueada: false, motivo: 'Digite o código de 4 números que a pessoa que recebe tem.' };
  if (limpo !== entrega.codigo) {
    const restam = MAX_TENTATIVAS_CODIGO - entrega.tentativas - 1;
    return {
      ok: false,
      bloqueada: restam <= 0,
      motivo: restam > 0 ? `Código errado. Confira com quem recebe (restam ${restam} tentativa(s)).` : 'Código errado. Fale com a Central para encerrar a entrega.',
    };
  }
  return { ok: true };
}
