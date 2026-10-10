import { Prisma } from '@prisma/client';
import { haversineKm } from '@ride/shared';
import type { MultiplierInput } from '@ride/shared';

/** Categorias de veiculo e multiplicador dinamico (guardados em settings). */
type Db = Pick<Prisma.TransactionClient, 'setting'>;

export const CHAVE_CATEGORIAS = 'tarifas.categorias';
export const CHAVE_MULTIPLICADOR = 'tarifas.multiplicador';

export interface Categoria {
  codigo: string;
  nome: string;
  ativa: boolean;
}

const PADRAO: Categoria[] = [{ codigo: 'CARRO', nome: 'Carro', ativa: true }];

export function codigoDaCategoria(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

export async function lerCategorias(db: Db): Promise<Categoria[]> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_CATEGORIAS } });
  const v = s?.value;
  if (!Array.isArray(v)) return PADRAO;
  const lista = (v as unknown[])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && !Array.isArray(c))
    .map((c) => ({ codigo: String(c.codigo ?? ''), nome: String(c.nome ?? ''), ativa: c.ativa !== false }))
    .filter((c) => c.codigo);
  if (!lista.some((c) => c.codigo === 'CARRO')) lista.unshift(PADRAO[0]);
  return lista;
}

export async function gravarCategorias(db: Db, lista: Categoria[]): Promise<void> {
  await db.setting.upsert({
    where: { key: CHAVE_CATEGORIAS },
    create: { key: CHAVE_CATEGORIAS, value: lista as never, description: 'Categorias de veiculo' },
    update: { value: lista as never },
  });
}

export async function lerMultiplicador(db: Db): Promise<MultiplierInput> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_MULTIPLICADOR } });
  const v = (s?.value ?? {}) as Partial<MultiplierInput>;
  return {
    cidade: typeof v.cidade === 'number' ? v.cidade : 1,
    zonas: Array.isArray(v.zonas) ? v.zonas : [],
  };
}

export async function gravarMultiplicador(db: Db, m: MultiplierInput): Promise<void> {
  await db.setting.upsert({
    where: { key: CHAVE_MULTIPLICADOR },
    create: { key: CHAVE_MULTIPLICADOR, value: m as never, description: 'Multiplicador dinamico' },
    update: { value: m as never },
  });
}

/** Zona tem prioridade sobre a cidade; entre zonas, vale a de maior multiplicador. */
export function multiplicadorNoPonto(m: MultiplierInput, ponto?: { latitude: number; longitude: number }): number {
  let valor = m.cidade || 1;
  if (ponto) {
    const dentro = m.zonas.filter((z) => haversineKm(ponto, z) <= z.raioKm);
    if (dentro.length) valor = Math.max(...dentro.map((z) => z.multiplicador));
  }
  return Math.round(valor * 100) / 100;
}

/** Categoria de moto (mototaxi): o codigo tem "MOTO" (ex.: MOTO, MOTOTAXI). */
export function ehMoto(codigo: string | null | undefined): boolean {
  return (codigo ?? '').toUpperCase().includes('MOTO');
}
