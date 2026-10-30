import { FareFlag, Prisma } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import type { Categoria } from './categorias';

/**
 * Semente das categorias padrao (Evandro, 29/10/2026): Popular (economico),
 * Conforto (medio) e Premium (luxo), editaveis pela Central.
 *
 * - "Popular" e a categoria CARRO de sempre (mesmo codigo: carros e corridas
 *   antigas continuam valendo, sem migrar nada).
 * - Conforto e Premium entram DESLIGADAS, com valores sugeridos a partir do
 *   Popular (x1,25 e x1,6). Ligam pela Central quando houver carro aprovado
 *   na categoria — senao o passageiro escolheria e ninguem atenderia.
 * - Roda uma vez so (marca "tarifas.categorias.versao" = 2): se o Evandro
 *   apagar ou mudar depois, a semente nao volta.
 */
export const CHAVE_VERSAO = 'tarifas.categorias.versao';
/**
 * 3 (30/10/2026): a Central 256, aberta desde antes da semente, gravou o nome
 * antigo "Carro" por cima do "Popular". A versao 3 so volta o nome (uma vez).
 */
export const VERSAO_ATUAL = 3;

/** "Carro" (nome antigo, ou vazio) volta a ser "Popular". Outro nome fica. */
export function popularDeVolta(categorias: Categoria[]): Categoria[] {
  return categorias.map((c) => (c.codigo === 'CARRO' && (c.nome === 'Carro' || !c.nome) ? { ...c, nome: 'Popular' } : c));
}

const NOVAS: Array<{ categoria: Categoria; fator: number }> = [
  {
    categoria: { codigo: 'CONFORTO', nome: 'Conforto', ativa: false, icone: 'conforto', descricao: 'Carro mais novo e espaçoso', capacidade: 4, multiplicador: 1 },
    fator: 1.25,
  },
  {
    categoria: { codigo: 'PREMIUM', nome: 'Premium', ativa: false, icone: 'premium', descricao: 'Carro de luxo, ar-condicionado', capacidade: 4, multiplicador: 1 },
    fator: 1.6,
  },
];

/** Arredonda para 10 centavos (preco "redondo" na Central). */
const dez = (n: number) => Math.round(n / 10) * 10;

export interface ResultadoDaSemente {
  categorias: Categoria[];
  tabelasNovas: Array<Omit<FareConfig, 'id' | 'createdAt' | 'updatedAt'>>;
}

/** Conta pura (testada sem banco). */
export function semente(categorias: Categoria[], tabelasDoCarro: FareConfig[]): ResultadoDaSemente {
  const lista = categorias.map((c) =>
    c.codigo === 'CARRO'
      ? { ...c, nome: c.nome === 'Carro' || !c.nome ? 'Popular' : c.nome, descricao: c.descricao || 'Econômico', icone: c.icone || 'carro' }
      : c,
  );
  const tabelasNovas: ResultadoDaSemente['tabelasNovas'] = [];
  for (const { categoria, fator } of NOVAS) {
    if (lista.some((c) => c.codigo === categoria.codigo)) continue;
    lista.push(categoria);
    for (const t of tabelasDoCarro) {
      tabelasNovas.push({
        flag: t.flag,
        category: categoria.codigo,
        perMinuteCents: dez(t.perMinuteCents * fator),
        startHour: t.startHour,
        endHour: t.endHour,
        baseFareCents: dez(t.baseFareCents * fator),
        perKmCents: dez(t.perKmCents * fator),
        waitingPerMinuteCents: t.waitingPerMinuteCents,
        freeDistanceMeters: t.freeDistanceMeters,
        freeWaitingSeconds: t.freeWaitingSeconds,
        minFareCents: dez(t.minFareCents * fator),
        cancellationFeeCents: t.cancellationFeeCents,
        commissionPercent: t.commissionPercent,
        isActive: true,
      });
    }
  }
  return { categorias: lista, tabelasNovas };
}

type Db = Pick<Prisma.TransactionClient, 'setting' | 'fareConfig'>;

/** Aplica a semente no banco, uma vez. Devolve true se mudou algo. */
export async function aplicarSemente(
  db: Db,
  ler: (db: Db) => Promise<Categoria[]>,
  gravar: (db: Db, lista: Categoria[]) => Promise<void>,
): Promise<boolean> {
  const marca = await db.setting.findUnique({ where: { key: CHAVE_VERSAO } });
  const versao = Number(marca?.value) || 0;
  if (versao >= VERSAO_ATUAL) return false;
  let lista = await ler(db);
  if (versao < 2) {
    const carro = await db.fareConfig.findMany({ where: { category: 'CARRO' } });
    if (carro.length === 0) return false; // banco sem as bandeiras ainda: espera a semente do banco
    const r = semente(lista, carro);
    for (const t of r.tabelasNovas) {
      await db.fareConfig.upsert({
        where: { category_flag: { category: t.category, flag: t.flag as FareFlag } },
        create: t,
        update: {},
      });
    }
    lista = r.categorias;
  }
  await gravar(db, popularDeVolta(lista));
  await db.setting.upsert({
    where: { key: CHAVE_VERSAO },
    update: { value: VERSAO_ATUAL },
    create: { key: CHAVE_VERSAO, value: VERSAO_ATUAL, description: 'Versao da semente de categorias (Popular, Conforto, Premium)' },
  });
  return true;
}
