import { FareFlag, Prisma } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import type { Categoria } from './categorias';

/**
 * Tarifas e categorias POR CIDADE (Evandro, 29/10/2026: "Central: criar,
 * editar, ativar e desativar categorias, por cidade").
 *
 * A tabela fare_configs continua sendo o PADRAO (vale para toda cidade que
 * nao tem ajuste). Cada cidade pode ter, por categoria: ligada/desligada,
 * multiplicador e os valores das duas bandeiras. Guardado em settings
 * (chave "tarifas.porCidade"), sem mudar o banco.
 */
export const CHAVE_POR_CIDADE = 'tarifas.porCidade';

type Db = Pick<Prisma.TransactionClient, 'setting'>;

/** Os valores de uma bandeira (os mesmos campos da fare_configs). */
export interface ValoresDaBandeira {
  startHour: number;
  endHour: number;
  baseFareCents: number;
  perKmCents: number;
  perMinuteCents: number;
  waitingPerMinuteCents: number;
  freeDistanceMeters: number;
  freeWaitingSeconds: number;
  minFareCents: number;
  cancellationFeeCents: number;
  commissionPercent: number;
}

export interface AjusteDaCidade {
  ativa?: boolean;
  multiplicador?: number;
  diurna?: ValoresDaBandeira;
  noturna?: ValoresDaBandeira;
  em?: string;
}

/** praca -> codigo da categoria -> ajuste. */
export type AjustesPorCidade = Record<string, Record<string, AjusteDaCidade>>;

const CAMPOS: Array<keyof ValoresDaBandeira> = [
  'startHour',
  'endHour',
  'baseFareCents',
  'perKmCents',
  'perMinuteCents',
  'waitingPerMinuteCents',
  'freeDistanceMeters',
  'freeWaitingSeconds',
  'minFareCents',
  'cancellationFeeCents',
  'commissionPercent',
];

function lerValores(v: unknown): ValoresDaBandeira | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const saida: Partial<ValoresDaBandeira> = {};
  for (const c of CAMPOS) {
    const n = Number(o[c]);
    if (!Number.isFinite(n) || n < 0) return undefined;
    saida[c] = c === 'commissionPercent' ? Math.round(n * 100) / 100 : Math.round(n);
  }
  return saida as ValoresDaBandeira;
}

export function lerAjustesDe(valor: unknown): AjustesPorCidade {
  const saida: AjustesPorCidade = {};
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return saida;
  for (const [praca, cats] of Object.entries(valor as Record<string, unknown>)) {
    if (!cats || typeof cats !== 'object' || Array.isArray(cats)) continue;
    for (const [codigo, a] of Object.entries(cats as Record<string, unknown>)) {
      if (!a || typeof a !== 'object') continue;
      const o = a as Record<string, unknown>;
      const m = Number(o.multiplicador);
      const ajuste: AjusteDaCidade = {
        ...(typeof o.ativa === 'boolean' ? { ativa: o.ativa } : {}),
        ...(Number.isFinite(m) && m >= 0.5 && m <= 5 ? { multiplicador: Math.round(m * 100) / 100 } : {}),
        ...(lerValores(o.diurna) ? { diurna: lerValores(o.diurna) } : {}),
        ...(lerValores(o.noturna) ? { noturna: lerValores(o.noturna) } : {}),
        ...(typeof o.em === 'string' ? { em: o.em } : {}),
      };
      (saida[praca] ??= {})[codigo.toUpperCase()] = ajuste;
    }
  }
  return saida;
}

export async function lerAjustes(db: Db): Promise<AjustesPorCidade> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_POR_CIDADE } });
  return lerAjustesDe(s?.value);
}

/** Grava (ou tira, com null) o ajuste de uma categoria numa cidade. */
export async function gravarAjuste(db: Db, praca: string, codigo: string, ajuste: AjusteDaCidade | null, quem?: string): Promise<AjustesPorCidade> {
  const todos = await lerAjustes(db);
  const daCidade = { ...(todos[praca] ?? {}) };
  if (ajuste) daCidade[codigo] = { ...ajuste, em: new Date().toISOString() };
  else delete daCidade[codigo];
  if (Object.keys(daCidade).length) todos[praca] = daCidade;
  else delete todos[praca];
  await db.setting.upsert({
    where: { key: CHAVE_POR_CIDADE },
    update: { value: todos as never, updatedBy: quem },
    create: { key: CHAVE_POR_CIDADE, value: todos as never, updatedBy: quem, description: 'Tarifas e categorias por cidade (ajustes sobre o padrao)' },
  });
  return todos;
}

export function ajusteDe(ajustes: AjustesPorCidade, praca: string | null | undefined, codigo: string): AjusteDaCidade | undefined {
  return praca ? ajustes[praca]?.[codigo.toUpperCase()] : undefined;
}

/** A linha da tabela com os valores da cidade por cima (se houver). */
export function aplicarAjuste(t: FareConfig, ajuste: AjusteDaCidade | undefined): FareConfig {
  const v = t.flag === FareFlag.NOTURNA ? ajuste?.noturna : ajuste?.diurna;
  if (!v) return t;
  return { ...t, ...v, commissionPercent: new Prisma.Decimal(v.commissionPercent) };
}

/** Categorias como valem nesta cidade (ligada e multiplicador). */
export function categoriasDaCidade(categorias: Categoria[], ajustes: AjustesPorCidade, praca: string | null | undefined): Categoria[] {
  return categorias.map((c) => {
    const a = ajusteDe(ajustes, praca, c.codigo);
    return {
      ...c,
      ativa: c.codigo === 'CARRO' ? true : (a?.ativa ?? c.ativa),
      multiplicador: a?.multiplicador ?? c.multiplicador,
    };
  });
}
