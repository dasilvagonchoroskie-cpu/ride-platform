import { FareFlag, Prisma } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import { CHAVE_CATEGORIAS, normalizarCategoria, lerCategorias, gravarCategorias } from './categorias';
import type { Categoria } from './categorias';
import { aplicarSemente, CHAVE_VERSAO, semente, VERSAO_ATUAL } from './semente-categorias';
import { CHAVE_POR_CIDADE, categoriasDaCidade, lerAjustesDe } from './tarifas-da-cidade';
import { FareService } from './fare.service';
import { chegadaEmMinutos } from './rides.service';
import { CHAVE_PRACAS } from '../pracas/pracas.store';

/** Linha da fare_configs como no banco (valores da semente: bandeirada R$ 10, R$ 2/km). */
function linha(category: string, flag: FareFlag, mudar: Partial<FareConfig> = {}): FareConfig {
  const diurna = flag === FareFlag.DIURNA;
  return {
    id: `${category}-${flag}`,
    flag,
    category,
    startHour: diurna ? 6 : 22,
    endHour: diurna ? 22 : 6,
    baseFareCents: diurna ? 1000 : 1200,
    perKmCents: diurna ? 200 : 250,
    perMinuteCents: 0,
    waitingPerMinuteCents: 50,
    freeDistanceMeters: 1500,
    freeWaitingSeconds: 180,
    minFareCents: 1000,
    cancellationFeeCents: 500,
    commissionPercent: new Prisma.Decimal(10),
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...mudar,
  };
}

/** Banco de mentira: settings e fare_configs em memoria. */
function bancoFalso(settings: Record<string, unknown>, tabelas: FareConfig[]) {
  return {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) => (where.key in settings ? { key: where.key, value: settings[where.key] } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        settings[where.key] = where.key in settings ? update.value : create.value;
        return { key: where.key, value: settings[where.key] };
      },
    },
    fareConfig: {
      findMany: async ({ where }: { where?: { category?: string; isActive?: boolean } } = {}) =>
        tabelas.filter((t) => (where?.category ? t.category === where.category : true) && (where?.isActive === undefined || t.isActive === where.isActive)),
      findUnique: async ({ where }: { where: { category_flag: { category: string; flag: FareFlag } } }) =>
        tabelas.find((t) => t.category === where.category_flag.category && t.flag === where.category_flag.flag) ?? null,
      upsert: async ({ where, create }: { where: { category_flag: { category: string; flag: FareFlag } }; create: FareConfig }) => {
        const ja = tabelas.find((t) => t.category === where.category_flag.category && t.flag === where.category_flag.flag);
        if (ja) return ja;
        const nova = { ...linha(create.category, create.flag), ...create };
        tabelas.push(nova);
        return nova;
      },
    },
  };
}

const GOIATUBA = { id: 'goiatuba', nome: 'Goiatuba', uf: 'GO', latitude: -18.0125, longitude: -49.3547, raioKm: 25, ativa: true };
const ITUMBIARA = { id: 'itumbiara', nome: 'Itumbiara', uf: 'GO', latitude: -18.4093, longitude: -49.2158, raioKm: 25, ativa: true };
const EM_GOIATUBA = { latitude: -18.0125, longitude: -49.3547 };
const EM_ITUMBIARA = { latitude: -18.4093, longitude: -49.2158 };
const MEIO_DIA = new Date('2026-10-29T15:00:00Z'); // 12h em Brasilia: diurna

describe('Categorias Popular, Conforto e Premium (semente)', () => {
  const carro = [linha('CARRO', FareFlag.DIURNA), linha('CARRO', FareFlag.NOTURNA)];

  it('Carro vira Popular (mesmo codigo) e entram Conforto e Premium desligadas, x1,25 e x1,6', () => {
    const antigas: Categoria[] = [normalizarCategoria({ codigo: 'CARRO', nome: 'Carro', ativa: true })];
    const r = semente(antigas, carro);
    expect(r.categorias.map((c) => [c.codigo, c.nome, c.ativa])).toEqual([
      ['CARRO', 'Popular', true],
      ['CONFORTO', 'Conforto', false],
      ['PREMIUM', 'Premium', false],
    ]);
    const conforto = r.tabelasNovas.find((t) => t.category === 'CONFORTO' && t.flag === FareFlag.DIURNA)!;
    expect([conforto.baseFareCents, conforto.perKmCents, conforto.minFareCents]).toEqual([1250, 250, 1250]);
    const premium = r.tabelasNovas.find((t) => t.category === 'PREMIUM' && t.flag === FareFlag.NOTURNA)!;
    expect([premium.baseFareCents, premium.perKmCents]).toEqual([1920, 400]);
    expect(r.tabelasNovas).toHaveLength(4);
  });

  it('nao mexe no nome que o Evandro deu e nao duplica categoria que ja existe', () => {
    const ja = [
      normalizarCategoria({ codigo: 'CARRO', nome: 'Economico', ativa: true }),
      normalizarCategoria({ codigo: 'CONFORTO', nome: 'Conforto+', ativa: true }),
    ];
    const r = semente(ja, carro);
    expect(r.categorias.map((c) => c.nome)).toEqual(['Economico', 'Conforto+', 'Premium']);
    expect(r.tabelasNovas.every((t) => t.category === 'PREMIUM')).toBe(true);
  });

  it('roda uma vez so (marca a versao) e espera o banco ter as bandeiras', async () => {
    const vazio = bancoFalso({}, []);
    expect(await aplicarSemente(vazio as never, (d) => lerCategorias(d as never), (d, l) => gravarCategorias(d as never, l))).toBe(false);

    const settings: Record<string, unknown> = { [CHAVE_CATEGORIAS]: [{ codigo: 'CARRO', nome: 'Carro', ativa: true }] };
    const tabelas = [...carro];
    const db = bancoFalso(settings, tabelas);
    expect(await aplicarSemente(db as never, (d) => lerCategorias(d as never), (d, l) => gravarCategorias(d as never, l))).toBe(true);
    expect(settings[CHAVE_VERSAO]).toBe(VERSAO_ATUAL);
    expect(tabelas.map((t) => t.category).sort()).toEqual(['CARRO', 'CARRO', 'CONFORTO', 'CONFORTO', 'PREMIUM', 'PREMIUM']);
    // O Evandro apaga o Premium depois: a semente nao traz de volta.
    settings[CHAVE_CATEGORIAS] = (settings[CHAVE_CATEGORIAS] as Categoria[]).filter((c) => c.codigo !== 'PREMIUM');
    expect(await aplicarSemente(db as never, (d) => lerCategorias(d as never), (d, l) => gravarCategorias(d as never, l))).toBe(false);
    expect((settings[CHAVE_CATEGORIAS] as Categoria[]).map((c) => c.codigo)).toEqual(['CARRO', 'CONFORTO']);
  });

  it('categoria gravada antes (sem figura, texto e lugares) continua valendo', () => {
    expect(normalizarCategoria({ codigo: 'MOTO', nome: 'Moto', ativa: true })).toEqual({
      codigo: 'MOTO', nome: 'Moto', ativa: true, icone: 'moto', descricao: '', capacidade: 1, multiplicador: 1,
    });
  });
});

describe('Categorias e tarifas por cidade', () => {
  const lista = [
    normalizarCategoria({ codigo: 'CARRO', nome: 'Popular', ativa: true }),
    normalizarCategoria({ codigo: 'CONFORTO', nome: 'Conforto', ativa: false }),
  ];

  it('Conforto ligado so em Goiatuba; Popular nunca desliga', () => {
    const ajustes = lerAjustesDe({ goiatuba: { conforto: { ativa: true, multiplicador: 1.1 }, CARRO: { ativa: false } } });
    expect(categoriasDaCidade(lista, ajustes, 'goiatuba').map((c) => [c.codigo, c.ativa, c.multiplicador])).toEqual([
      ['CARRO', true, 1],
      ['CONFORTO', true, 1.1],
    ]);
    expect(categoriasDaCidade(lista, ajustes, 'itumbiara').map((c) => c.ativa)).toEqual([true, false]);
    expect(categoriasDaCidade(lista, ajustes, null).map((c) => c.ativa)).toEqual([true, false]);
  });

  it('descarta valor estragado (negativo, multiplicador fora de 0,5 a 5)', () => {
    const a = lerAjustesDe({ goiatuba: { CONFORTO: { multiplicador: 9, diurna: { baseFareCents: -1 } } }, x: 'lixo' });
    expect(a).toEqual({ goiatuba: { CONFORTO: {} } });
  });

  function fare(settings: Record<string, unknown>, tabelas: FareConfig[]) {
    return new FareService(bancoFalso(settings, tabelas) as never);
  }

  const tabelas = [
    linha('CARRO', FareFlag.DIURNA),
    linha('CARRO', FareFlag.NOTURNA),
    linha('CONFORTO', FareFlag.DIURNA, { baseFareCents: 1250, perKmCents: 250 }),
    linha('CONFORTO', FareFlag.NOTURNA, { baseFareCents: 1500, perKmCents: 310 }),
  ];
  const valoresGoiatuba = {
    startHour: 6, endHour: 22, baseFareCents: 1500, perKmCents: 300, perMinuteCents: 20, waitingPerMinuteCents: 50,
    freeDistanceMeters: 1000, freeWaitingSeconds: 180, minFareCents: 1500, cancellationFeeCents: 600, commissionPercent: 12,
  };
  const settings = () => ({
    [CHAVE_PRACAS]: [GOIATUBA, ITUMBIARA],
    [CHAVE_CATEGORIAS]: lista,
    [CHAVE_POR_CIDADE]: { goiatuba: { CONFORTO: { ativa: true, multiplicador: 1.2, diurna: valoresGoiatuba } } },
  });

  it('mesma viagem (5 km, 12 min): preco por categoria e por cidade, rota medida uma vez', async () => {
    const f = fare(settings(), tabelas);
    const viagem = { distanceMeters: 5000, durationSeconds: 720, quando: MEIO_DIA };
    const popularGoiatuba = await f.calcular({ ...viagem, category: 'CARRO', pickup: EM_GOIATUBA });
    // 10,00 + (5 - 1,5) km x 2,00 = 17,00
    expect(popularGoiatuba.totalCents).toBe(1700);
    const confortoGoiatuba = await f.calcular({ ...viagem, category: 'CONFORTO', pickup: EM_GOIATUBA });
    // Valores de Goiatuba: 15,00 + 4 km x 3,00 + 12 min x 0,20 = 29,40; x1,2 = 35,28
    expect(confortoGoiatuba.subtotalCents).toBe(2940);
    expect(confortoGoiatuba.multiplier).toBe(1.2);
    expect(confortoGoiatuba.totalCents).toBe(3528);
    expect(confortoGoiatuba.commissionPercent).toBe(12);
    const confortoItumbiara = await f.calcular({ ...viagem, category: 'CONFORTO', pickup: EM_ITUMBIARA });
    // Padrao do Conforto: 12,50 + 3,5 km x 2,50 = 21,25
    expect(confortoItumbiara.totalCents).toBe(2125);
    expect(confortoItumbiara.multiplier).toBe(1);
  });

  it('fim da corrida e taximetro: bandeira e multiplicador do pedido, valores da cidade do embarque', async () => {
    const f = fare(settings(), tabelas);
    const fim = await f.calcular({ distanceMeters: 5000, durationSeconds: 720, flag: FareFlag.DIURNA, category: 'CONFORTO', multiplier: 1.2, pickup: EM_GOIATUBA });
    expect(fim.totalCents).toBe(3528);
    // Corrida antiga (sem embarque informado): segue a tabela padrao, como antes.
    const antiga = await f.calcular({ distanceMeters: 5000, durationSeconds: 720, flag: FareFlag.DIURNA, category: 'CONFORTO', multiplier: 1 });
    expect(antiga.totalCents).toBe(2125);
    const tabela = await f.tabelaDaCorrida('CONFORTO', FareFlag.DIURNA, EM_GOIATUBA);
    expect(tabela?.baseFareCents).toBe(1500);
    expect(await f.taxaDeCancelamento(MEIO_DIA, 'CONFORTO', EM_GOIATUBA)).toBe(600);
  });

  it('categoria ligada na cidade aparece; desligada nao', async () => {
    const f = fare(settings(), tabelas);
    expect((await f.categoriasNoPonto(EM_GOIATUBA)).filter((c) => c.ativa).map((c) => c.codigo)).toEqual(['CARRO', 'CONFORTO']);
    expect((await f.categoriasNoPonto(EM_ITUMBIARA)).filter((c) => c.ativa).map((c) => c.codigo)).toEqual(['CARRO']);
  });
});

describe('Tempo de chegada (linha reta, sem gastar a TomTom)', () => {
  it('x1,35 nas ruas a 25 km/h, mais 1 minuto; no minimo 2', () => {
    expect(chegadaEmMinutos(100)).toBe(2);
    expect(chegadaEmMinutos(2000)).toBe(8); // 2 km x 1,35 = 2,7 km a 25 km/h = 6,5 -> 7 + 1
    expect(chegadaEmMinutos(10_000)).toBe(34);
  });
});
