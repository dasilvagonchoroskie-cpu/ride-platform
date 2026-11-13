import { ExecutionContext } from '@nestjs/common';
import { PracasService } from './pracas.service';
import { DonoGravaGuard, SoDonoGuard } from './so-dono.guard';
import { PRACA_PADRAO, caixaDaPraca, codigoDaPraca, lerListaDePracas, pracaDoPonto } from './pracas.store';

/**
 * Cidades (pracas): quem ve o que. Base do isolamento do operador de cidade.
 * Banco de mentira.
 */
const GOIATUBA = { ...PRACA_PADRAO };
const TEUTONIA = { id: 'teutonia-rs', nome: 'Teutonia', uf: 'RS', latitude: -29.4469, longitude: -51.8044, raioKm: 30, ativa: true };

function montar(opcoes: { setting?: unknown; usuarios?: Record<string, { role: string; metadata?: Record<string, unknown> }> } = {}) {
  const usuarios = opcoes.usuarios ?? {};
  const prisma = {
    setting: {
      findUnique: jest.fn(async () => (opcoes.setting === undefined ? null : { value: opcoes.setting })),
      upsert: jest.fn(async () => ({})),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => usuarios[where.id] ?? null),
      update: jest.fn(async () => ({})),
    },
    ride: { findUnique: jest.fn(async () => ({ pickupLat: -29.45, pickupLng: -51.8 })) },
    $queryRaw: jest.fn(async () => [] as unknown[]),
  };
  return { servico: new PracasService(prisma as never), prisma };
}

const dono = { id: 'dono', role: 'ADMIN' } as never;
const operador = { id: 'op', role: 'ADMIN' } as never;
const USUARIOS = {
  dono: { role: 'ADMIN', metadata: {} },
  op: { role: 'ADMIN', metadata: { praca: 'teutonia-rs' } },
  motorista: { role: 'DRIVER', metadata: { praca: 'teutonia-rs' } },
};

describe('Cadastro das cidades (store)', () => {
  it('sem cadastro valido volta so Goiatuba', () => {
    expect(lerListaDePracas(undefined)).toEqual([PRACA_PADRAO]);
    expect(lerListaDePracas([])).toEqual([PRACA_PADRAO]);
    expect(lerListaDePracas([{ id: 'x' }, null, 'lixo'])).toEqual([PRACA_PADRAO]);
  });

  it('limita o raio entre 5 e 300 km e normaliza campos', () => {
    const [a, b] = lerListaDePracas([
      { id: 'a', latitude: 1, longitude: 2, raioKm: 1, uf: 'rs' },
      { id: 'b', latitude: 1, longitude: 2, raioKm: 9999, ativa: false, fonteBusca: 'google' },
    ]);
    expect(a.raioKm).toBe(5);
    expect(a.uf).toBe('RS');
    expect(a.fonteBusca).toBe('tomtom');
    expect(b.raioKm).toBe(300);
    expect(b.ativa).toBe(false);
    expect(b.fonteBusca).toBe('google');
  });

  it('codigo da cidade: sem acento, minusculo, com hifen', () => {
    expect(codigoDaPraca('São José', 'SC')).toBe('sao-jose-sc');
    expect(codigoDaPraca('!!!', '')).toBe('praca');
  });

  it('ponto dentro do raio vai para a cidade mais perto; fora de todas, null', () => {
    const lista = [GOIATUBA, TEUTONIA];
    expect(pracaDoPonto(lista, { latitude: -18.02, longitude: -49.35 })?.id).toBe('goiatuba');
    expect(pracaDoPonto(lista, { latitude: -29.45, longitude: -51.8 })?.id).toBe('teutonia-rs');
    expect(pracaDoPonto(lista, { latitude: -23.5, longitude: -46.6 })).toBeNull();
  });

  it('a caixa do filtro contem o raio da cidade', () => {
    const c = caixaDaPraca(GOIATUBA);
    expect(c.latMin).toBeLessThan(GOIATUBA.latitude);
    expect(c.latMax).toBeGreaterThan(GOIATUBA.latitude);
    expect(c.lngMin).toBeLessThan(GOIATUBA.longitude);
    expect(c.lngMax).toBeGreaterThan(GOIATUBA.longitude);
  });
});

describe('Quem esta pedindo (dono x operador)', () => {
  it('dono nao tem cidade; operador tem a dele', async () => {
    const { servico } = montar({ usuarios: USUARIOS });
    expect(await servico.escopoDe('dono')).toBeNull();
    expect(await servico.escopoDe('op')).toBe('teutonia-rs');
  });

  it('a cidade so vale para conta da Central (motorista com "praca" nao vira operador)', async () => {
    const { servico } = montar({ usuarios: USUARIOS });
    expect(await servico.escopoDe('motorista')).toBeNull();
  });

  it('filtro: operador sempre na cidade dele, mesmo pedindo outra ou "todas"', async () => {
    const { servico } = montar({ usuarios: USUARIOS, setting: [GOIATUBA, TEUTONIA] });
    expect(await servico.filtro(operador, 'goiatuba')).toBe('teutonia-rs');
    expect(await servico.filtro(operador, 'todas')).toBe('teutonia-rs');
  });

  it('filtro: dono escolhe a cidade; "todas", vazio ou cidade que nao existe = sem filtro', async () => {
    const { servico } = montar({ usuarios: USUARIOS, setting: [GOIATUBA, TEUTONIA] });
    expect(await servico.filtro(dono, 'goiatuba')).toBe('goiatuba');
    expect(await servico.filtro(dono, 'todas')).toBeNull();
    expect(await servico.filtro(dono, undefined)).toBeNull();
    expect(await servico.filtro(dono, 'inventada')).toBeNull();
    expect(await servico.filtro(undefined, 'goiatuba')).toBeNull();
  });

  it('exigirDono: operador e recusado; dono passa; sem usuario e recusado', async () => {
    const { servico } = montar({ usuarios: USUARIOS });
    await expect(servico.exigirDono(operador)).rejects.toThrow('So o dono');
    await expect(servico.exigirDono(dono)).resolves.toBeUndefined();
    await expect(servico.exigirDono(undefined)).rejects.toThrow('Sem permissao');
  });

  it('exigirAcesso: operador so mexe no que e da cidade dele; dono mexe em tudo', async () => {
    const { servico } = montar({ usuarios: USUARIOS });
    await expect(servico.exigirAcesso(operador, 'teutonia-rs')).resolves.toBeUndefined();
    await expect(servico.exigirAcesso(operador, 'goiatuba')).rejects.toThrow('outra cidade');
    await expect(servico.exigirAcesso(operador, null)).rejects.toThrow('outra cidade');
    await expect(servico.exigirAcesso(dono, 'goiatuba')).resolves.toBeUndefined();
  });

  it('senha provisoria e refazer duas etapas so valem para conta da Central', async () => {
    const { servico } = montar({
      usuarios: {
        a: { role: 'ADMIN', metadata: { senhaProvisoria: true, refazerDoisFatores: true } },
        p: { role: 'PASSENGER', metadata: { senhaProvisoria: true, refazerDoisFatores: true } },
      },
    });
    expect(await servico.senhaProvisoria('a')).toBe(true);
    expect(await servico.refazerDoisFatores('a')).toBe(true);
    expect(await servico.senhaProvisoria('p')).toBe(false);
    expect(await servico.refazerDoisFatores('p')).toBe(false);
    expect(await servico.senhaProvisoria('nao-existe')).toBe(false);
  });

  it('o escopo fica guardado por um minuto; esquecerEscopo forca ler de novo', async () => {
    const { servico, prisma } = montar({ usuarios: USUARIOS });
    await servico.escopoDe('op');
    await servico.escopoDe('op');
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    servico.esquecerEscopo('op');
    await servico.escopoDe('op');
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('Filtros por cidade', () => {
  it('sem cidade: sem filtro; cidade que nao existe: nada passa', async () => {
    const { servico } = montar({ setting: [GOIATUBA] });
    expect(await servico.ondeCorridas(null)).toEqual({});
    expect(await servico.ondeSos(null)).toEqual({});
    expect(await servico.ondeCorridas('inventada')).toEqual({ id: { in: [] } });
    expect(await servico.ondeSos('inventada')).toEqual({ id: { in: [] } });
  });

  it('corridas e SOS da cidade usam a caixa do raio (embarque / posicao do alerta)', async () => {
    const { servico } = montar({ setting: [GOIATUBA, TEUTONIA] });
    const caixa = caixaDaPraca(TEUTONIA);
    expect(await servico.ondeCorridas('teutonia-rs')).toEqual({
      pickupLat: { gte: caixa.latMin, lte: caixa.latMax },
      pickupLng: { gte: caixa.lngMin, lte: caixa.lngMax },
    });
    expect(await servico.ondeSos('teutonia-rs')).toEqual({
      latitude: { gte: caixa.latMin, lte: caixa.latMax },
      longitude: { gte: caixa.lngMin, lte: caixa.lngMax },
    });
  });

  it('cidade da corrida vem do ponto de embarque', async () => {
    const { servico } = montar({ setting: [GOIATUBA, TEUTONIA] });
    expect(await servico.pracaDaCorrida('r1')).toBe('teutonia-rs');
  });
});

describe('Cidade de cada motorista', () => {
  it('a escolhida no cadastro vale; sem ela, onde ele esta; sem posicao e varias cidades, nenhuma', async () => {
    const { servico, prisma } = montar({ setting: [GOIATUBA, TEUTONIA] });
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 'd1', praca: 'goiatuba', lat: -29.45, lng: -51.8 }, // escolheu Goiatuba, esta em Teutonia
      { id: 'd2', praca: null, lat: -29.45, lng: -51.8 },
      { id: 'd3', praca: 'inventada', lat: null, lng: null },
    ]);
    const mapa = await servico.mapaDeMotoristas();
    expect(mapa.get('d1')).toBe('goiatuba');
    expect(mapa.get('d2')).toBe('teutonia-rs');
    expect(mapa.get('d3')).toBeNull();
  });

  it('com uma cidade so, motorista sem posicao fica nela', async () => {
    const { servico, prisma } = montar({ setting: [GOIATUBA] });
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'd1', praca: null, lat: null, lng: null }]);
    expect(await servico.pracaDoMotorista('d1')).toBe('goiatuba');
  });

  it('idsDeMotoristas: sem cidade = sem filtro (null); com cidade = so os dela', async () => {
    const { servico, prisma } = montar({ setting: [GOIATUBA, TEUTONIA] });
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 'd1', praca: 'goiatuba', lat: null, lng: null },
      { id: 'd2', praca: 'teutonia-rs', lat: null, lng: null },
    ]);
    expect(await servico.idsDeMotoristas(null)).toBeNull();
    expect(await servico.idsDeMotoristas('teutonia-rs')).toEqual(['d2']);
  });

  it('definirPracaDoMotorista grava e limpa a cidade sem perder o resto do metadata', async () => {
    const { servico, prisma } = montar({ usuarios: { u: { role: 'DRIVER', metadata: { teste: true, praca: 'goiatuba' } } } });
    await servico.definirPracaDoMotorista('u', 'teutonia-rs');
    expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 'u' }, data: { metadata: { teste: true, praca: 'teutonia-rs' } } });
    await servico.definirPracaDoMotorista('u', null);
    expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 'u' }, data: { metadata: { teste: true } } });
  });

  it('gravar a lista esquece o cache e registra quem gravou', async () => {
    const { servico, prisma } = montar({ setting: [GOIATUBA] });
    await servico.listar();
    await servico.gravar([GOIATUBA, TEUTONIA], 'dono');
    expect(prisma.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ updatedBy: 'dono' }) }));
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('Guardas do dono', () => {
  const contexto = (user: unknown, method = 'GET') =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user, method }) }) }) as unknown as ExecutionContext;

  it('SoDonoGuard: operador barrado em qualquer metodo, dono passa', async () => {
    const { servico } = montar({ usuarios: USUARIOS });
    const guarda = new SoDonoGuard(servico);
    await expect(guarda.canActivate(contexto({ id: 'op', role: 'ADMIN' }, 'GET'))).rejects.toThrow('So o dono');
    await expect(guarda.canActivate(contexto({ id: 'dono', role: 'ADMIN' }, 'POST'))).resolves.toBe(true);
  });

  it('DonoGravaGuard: operador le (GET) mas nao grava (POST/PATCH/DELETE)', async () => {
    const { servico } = montar({ usuarios: USUARIOS });
    const guarda = new DonoGravaGuard(servico);
    await expect(guarda.canActivate(contexto({ id: 'op', role: 'ADMIN' }, 'GET'))).resolves.toBe(true);
    for (const m of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      await expect(guarda.canActivate(contexto({ id: 'op', role: 'ADMIN' }, m))).rejects.toThrow('So o dono');
    }
    await expect(guarda.canActivate(contexto({ id: 'dono', role: 'ADMIN' }, 'POST'))).resolves.toBe(true);
  });

  it('quem nao e da Central passa direto (o RolesGuard ja decidiu)', async () => {
    const { servico } = montar();
    await expect(new SoDonoGuard(servico).canActivate(contexto({ id: 'p', role: 'PASSENGER' }, 'POST'))).resolves.toBe(true);
  });
});
