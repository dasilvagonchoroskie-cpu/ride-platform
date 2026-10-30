import { FareFlag, Prisma } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import { CHAVE_CATEGORIAS } from '../rides/categorias';
import { CHAVE_POR_CIDADE } from '../rides/tarifas-da-cidade';
import { CHAVE_VERSAO } from '../rides/semente-categorias';
import { TariffsService } from './tariffs.service';

/** Banco de mentira com o relogio andando a cada gravacao. */
function banco() {
  let relogio = Date.parse('2026-10-30T03:00:00Z');
  const agora = () => new Date((relogio += 1000));
  const settings = new Map<string, { value: unknown; updatedAt: Date }>();
  const tabelas: FareConfig[] = [];
  const linha = (category: string, flag: FareFlag): FareConfig => ({
    id: `${category}-${flag}`, flag, category, perMinuteCents: 0,
    startHour: flag === FareFlag.DIURNA ? 6 : 22, endHour: flag === FareFlag.DIURNA ? 22 : 6,
    baseFareCents: 1000, perKmCents: 200, waitingPerMinuteCents: 50, freeDistanceMeters: 1500, freeWaitingSeconds: 180,
    minFareCents: 1000, cancellationFeeCents: 500, commissionPercent: new Prisma.Decimal(8), isActive: true,
    createdAt: new Date(0), updatedAt: agora(),
  });
  tabelas.push(linha('CARRO', FareFlag.DIURNA), linha('CARRO', FareFlag.NOTURNA));
  settings.set(CHAVE_CATEGORIAS, { value: [{ codigo: 'CARRO', nome: 'Popular', ativa: true }], updatedAt: agora() });
  settings.set(CHAVE_VERSAO, { value: 3, updatedAt: agora() });
  const setting = {
    findUnique: async ({ where }: { where: { key: string } }) => {
      const s = settings.get(where.key);
      return s ? { key: where.key, ...s } : null;
    },
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      where.key.in.filter((k) => settings.has(k)).map((k) => ({ key: k, ...settings.get(k)! })),
    upsert: async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
      settings.set(where.key, { value: settings.has(where.key) ? update.value : create.value, updatedAt: agora() });
      return { key: where.key };
    },
  };
  const fareConfig = {
    findMany: async () => tabelas,
    aggregate: async () => ({ _max: { updatedAt: new Date(Math.max(...tabelas.map((t) => t.updatedAt.getTime()))) } }),
    upsert: async ({ where, create, update }: { where: { category_flag: { category: string; flag: FareFlag } }; create: Partial<FareConfig>; update: Partial<FareConfig> }) => {
      const i = tabelas.findIndex((t) => t.category === where.category_flag.category && t.flag === where.category_flag.flag);
      if (i >= 0) tabelas[i] = { ...tabelas[i], ...update, updatedAt: agora() } as FareConfig;
      else tabelas.push({ ...linha(where.category_flag.category, where.category_flag.flag), ...create, updatedAt: agora() } as FareConfig);
      return tabelas[tabelas.length - 1];
    },
  };
  const prisma = { setting, fareConfig, withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ setting, fareConfig }) };
  return { prisma, settings, tabelas };
}

const bandeira = (inicio: number, fim: number) => ({
  startHour: inicio, endHour: fim, baseFareCents: 1100, perKmCents: 210, perMinuteCents: 0, waitingPerMinuteCents: 50,
  freeDistanceMeters: 1500, freeWaitingSeconds: 180, minFareCents: 1100, cancellationFeeCents: 500, commissionPercent: 8,
});

describe('Tarifas: nome protegido e versao (30/10/2026)', () => {
  it('Central antiga (sem versao) salva os valores mas nao troca o nome', async () => {
    const b = banco();
    const t = new TariffsService(b.prisma as never);
    await t.salvarCategoria('CARRO', { nome: 'Carro', ativa: true, diurna: bandeira(6, 22), noturna: bandeira(22, 6) });
    const cats = b.settings.get(CHAVE_CATEGORIAS)!.value as Array<{ codigo: string; nome: string }>;
    expect(cats.find((c) => c.codigo === 'CARRO')?.nome).toBe('Popular');
    expect(b.tabelas.find((x) => x.flag === FareFlag.DIURNA)?.baseFareCents).toBe(1100);
  });

  it('Central nova (com versao) troca o nome; tela velha que salva depois e recusada', async () => {
    const b = banco();
    const t = new TariffsService(b.prisma as never);
    const tela1 = await t.listar();
    const tela2 = await t.listar();
    const r = await t.salvarCategoria('CARRO', { nome: 'Comum', ativa: true, diurna: bandeira(6, 22), noturna: bandeira(22, 6), versao: tela1.versao });
    expect(r.categorias.find((c) => c.codigo === 'CARRO')?.nome).toBe('Comum');
    await expect(
      t.salvarCategoria('CARRO', { nome: 'Carro', ativa: true, diurna: bandeira(6, 22), noturna: bandeira(22, 6), versao: tela2.versao }),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('outra tela') } });
    // Com a versao nova (tela aberta de novo), salva.
    const r2 = await t.salvarCategoria('CARRO', { nome: 'Executivo', ativa: true, diurna: bandeira(6, 22), noturna: bandeira(22, 6), versao: r.versao });
    expect(r2.categorias.find((c) => c.codigo === 'CARRO')?.nome).toBe('Executivo');
  });

  it('categoria nova com a cidade escolhida: ligada so nela, desligada nas outras', async () => {
    const b = banco();
    const t = new TariffsService(b.prisma as never);
    const r = await t.salvarCategoria('NOVA', { nome: 'Executivo', ativa: true, diurna: bandeira(6, 22), noturna: bandeira(22, 6) }, 'goiatuba');
    const exec = r.categorias.find((c) => c.codigo === 'EXECUTIVO');
    expect(exec?.ativa).toBe(true);
    expect(exec?.daCidade).toBe(true);
    expect(r.praca).toBe('goiatuba');
    const geral = await t.listar(null);
    expect(geral.categorias.find((c) => c.codigo === 'EXECUTIVO')?.ativa).toBe(false);
    const outra = await t.listar('itumbiara');
    expect(outra.categorias.find((c) => c.codigo === 'EXECUTIVO')?.ativa).toBe(false);
    expect((b.settings.get(CHAVE_POR_CIDADE)!.value as Record<string, Record<string, { ativa: boolean }>>).goiatuba.EXECUTIVO.ativa).toBe(true);
  });
});
