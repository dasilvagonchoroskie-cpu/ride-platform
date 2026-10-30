import { Prisma } from '@prisma/client';
import { haversineKm } from '@ride/shared';
import type { MultiplierInput } from '@ride/shared';

/** Categorias de veiculo e multiplicador dinamico (guardados em settings). */
type Db = Pick<Prisma.TransactionClient, 'setting'>;

export const CHAVE_CATEGORIAS = 'tarifas.categorias';
export const CHAVE_MULTIPLICADOR = 'tarifas.multiplicador';

/** Desenho da categoria no app (o passageiro escolhe pela figura). */
export const ICONES = ['carro', 'conforto', 'premium', 'moto', 'van'] as const;
export type IconeDaCategoria = (typeof ICONES)[number];

export interface Categoria {
  codigo: string;
  nome: string;
  ativa: boolean;
  /** Etapa de categorias (29/10/2026): figura, texto curto e lugares. */
  icone: IconeDaCategoria;
  descricao: string;
  capacidade: number;
  /** Multiplicador da categoria (1 = normal), alem do dinamico da cidade/zona. */
  multiplicador: number;
}

/** O codigo CARRO continua (carros e corridas antigas); o nome e "Popular". */
const PADRAO: Categoria[] = [
  { codigo: 'CARRO', nome: 'Popular', ativa: true, icone: 'carro', descricao: 'Econômico', capacidade: 4, multiplicador: 1 },
];

/** Campos novos com valor padrao (categoria gravada antes nao tinha). */
export function normalizarCategoria(c: Record<string, unknown>): Categoria {
  const codigo = String(c.codigo ?? '');
  const moto = ehMoto(codigo);
  const icone = ICONES.includes(c.icone as IconeDaCategoria) ? (c.icone as IconeDaCategoria) : moto ? 'moto' : 'carro';
  const cap = Number(c.capacidade);
  const mult = Number(c.multiplicador);
  return {
    codigo,
    nome: String(c.nome ?? '') || codigo,
    ativa: c.ativa !== false,
    icone,
    descricao: typeof c.descricao === 'string' ? c.descricao.trim().slice(0, 120) : '',
    capacidade: Number.isInteger(cap) && cap >= 1 && cap <= 20 ? cap : moto ? 1 : 4,
    multiplicador: Number.isFinite(mult) && mult >= 0.5 && mult <= 5 ? Math.round(mult * 100) / 100 : 1,
  };
}

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
    .map((c) => normalizarCategoria(c))
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
