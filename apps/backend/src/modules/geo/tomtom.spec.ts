import { ContaDoUso, COTA_GRATIS_DO_MES, cotaDoMes, diaDeBrasilia, UsoDoMapaService } from './uso-do-mapa';
import { GeoService } from './geo.service';
import { LimiteDoMapa, paraLugar, pontosDaRota, ProvedorGeo, semChave, TomTomGeo } from './tomtom';

// Chave de mentira (formato das chaves da TomTom); a de verdade so no Render.
const CHAVE_FALSA = 'abcdefghijklmnopqrstuvwxyz012345';

describe('TomTom: formato das respostas', () => {
  it('rua com numero, bairro e cidade', () => {
    expect(
      paraLugar({
        type: 'Point Address',
        address: {
          streetName: 'Avenida Brasília',
          streetNumber: '120',
          municipalitySubdivision: 'Centro',
          municipality: 'Goiatuba',
          countrySubdivisionCode: 'GO',
          countryCode: 'BR',
        },
        position: { lat: -18.01, lon: -49.35 },
      }),
    ).toEqual({ address: 'Avenida Brasília, 120', detail: 'Centro, Goiatuba - GO', latitude: -18.01, longitude: -49.35 });
  });

  it('lugar com nome (POI) e cidade inteira', () => {
    expect(
      paraLugar({
        type: 'POI',
        poi: { name: 'Rodoviária de Goiatuba' },
        address: { streetName: 'Rua Goiás', municipality: 'Goiatuba', countrySubdivisionCode: 'BR-GO', countryCode: 'BR' },
        position: { lat: -18.0, lon: -49.36 },
      })?.address,
    ).toBe('Rodoviária de Goiatuba');
    expect(
      paraLugar({
        type: 'Geography',
        address: { municipality: 'Porto Alegre', countrySubdivisionCode: 'RS', countryCode: 'BR' },
        position: { lat: -30.03, lon: -51.22 },
      })?.address,
    ).toBe('Porto Alegre - RS');
  });

  it('fora do Brasil ou sem posicao fica de fora', () => {
    expect(paraLugar({ address: { countryCode: 'AR' }, position: { lat: 1, lon: 1 } })).toBeNull();
    expect(paraLugar({ address: { streetName: 'Rua X' } })).toBeNull();
  });

  it('rota: distancia, tempo e pontos (no maximo ~500)', () => {
    const muitos = Array.from({ length: 1200 }, (_, i) => ({ latitude: -18 + i / 10000, longitude: -49.3 }));
    const r = pontosDaRota({ routes: [{ summary: { lengthInMeters: 1234.4, travelTimeInSeconds: 301 }, legs: [{ points: muitos }] }] });
    expect(r?.distanceMeters).toBe(1234);
    expect(r?.durationSeconds).toBe(301);
    expect(r!.pontos.length).toBeLessThanOrEqual(501);
    expect(r!.pontos[r!.pontos.length - 1]).toEqual([muitos[1199].latitude, -49.3]);
    expect(pontosDaRota({ routes: [] })).toBeNull();
  });

  it('a chave nunca sai no registro', () => {
    expect(semChave(`/search/2/geocode/x.json?language=pt-BR&key=${CHAVE_FALSA}`)).not.toContain(CHAVE_FALSA);
  });

  it('chave so da variavel TOMTOM_API_KEY, e com formato de chave', () => {
    expect(TomTomGeo.daVariavel({ TOMTOM_API_KEY: CHAVE_FALSA })).toBe(CHAVE_FALSA);
    expect(TomTomGeo.daVariavel({ TOMTOM_API_KEY: ' ' })).toBeNull();
    expect(TomTomGeo.daVariavel({})).toBeNull();
  });

  it('429 e 403 da TomTom viram LimiteDoMapa; o pedido conta no contador', async () => {
    const contados: string[] = [];
    const urls: string[] = [];
    const t = new TomTomGeo(CHAVE_FALSA, (s) => contados.push(s), async (url) => {
      urls.push(url);
      return { ok: false, status: 429, json: async () => ({}) };
    });
    await expect(t.geocodificar('Rua A', { lat: -18, lng: -49 }, 80000)).rejects.toBeInstanceOf(LimiteDoMapa);
    expect(contados).toEqual(['geocode']);
    expect(urls[0]).toContain('countrySet=BR');
    expect(urls[0]).toContain('radius=80000');
    const t403 = new TomTomGeo(CHAVE_FALSA, undefined, async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(t403.rota({ latitude: -18, longitude: -49 }, { latitude: -18.1, longitude: -49.1 })).rejects.toBeInstanceOf(LimiteDoMapa);
  });
});

describe('Contador da TomTom (cota da chave, para todos)', () => {
  const cota = { ...COTA_GRATIS_DO_MES };

  it('cota gratis do mes e parte do dia', () => {
    const c = new ContaDoUso(ContaDoUso.vazio(), cota);
    expect(c.parteDoDia('geocode')).toBe(666);
    expect(c.parteDoDia('search')).toBe(83);
  });

  it('economia a partir de 80% da parte do dia: o nao essencial para, o essencial continua', () => {
    const c = new ContaDoUso(ContaDoUso.vazio(), cota);
    for (let i = 0; i < 533; i++) c.contar('geocode');
    expect(c.economia('geocode')).toBe(true);
    expect(c.pode('geocode', false)).toBe(false);
    expect(c.pode('geocode', true)).toBe(true);
    expect(c.pode('routing', false)).toBe(true);
  });

  it('a 98% do mes para tudo; 429 da TomTom para ate a meia-noite', () => {
    const c = new ContaDoUso(ContaDoUso.vazio(), cota);
    c.estado.noMes.search = 2450;
    expect(c.pode('search', true)).toBe(false);
    const d = new ContaDoUso(ContaDoUso.vazio(), cota);
    d.limiteDaTomTom();
    expect(d.pode('reverse', true)).toBe(false);
    expect(d.estado.paradoAte).toBeGreaterThan(Date.now());
  });

  it('virada do dia zera o dia; virada do mes zera tudo', () => {
    const c = new ContaDoUso({ dia: '2026-10-28', mes: '2026-10', hoje: { geocode: 9, reverse: 0, routing: 0, search: 0 }, noMes: { geocode: 50, reverse: 0, routing: 0, search: 0 }, paradoAte: 0 }, cota);
    c.atualizarDia(new Date('2026-10-29T15:00:00Z'));
    expect(c.estado.hoje.geocode).toBe(0);
    expect(c.estado.noMes.geocode).toBe(50);
    c.atualizarDia(new Date('2026-11-01T15:00:00Z'));
    expect(c.estado.noMes.geocode).toBe(0);
  });

  it('dia no horario de Brasilia e cota ajustavel pelo Render', () => {
    expect(diaDeBrasilia(new Date('2026-10-30T02:00:00Z')).dia).toBe('2026-10-29');
    expect(cotaDoMes({ TOMTOM_COTA_MES: '{"search":5000}' }).search).toBe(5000);
    expect(cotaDoMes({ TOMTOM_COTA_MES: 'quebrado' }).search).toBe(2500);
  });
});

describe('GeoService com a TomTom', () => {
  function uso() {
    const prisma = { setting: { findUnique: async () => null, upsert: async () => null } };
    return new UsoDoMapaService(prisma as never);
  }
  const lugar = (address: string, lat: number, lng: number) => ({ address, detail: 'Goiatuba - GO', latitude: lat, longitude: lng });

  it('regiao primeiro, depois o Brasil; a mesma busca de novo nao pede de novo', async () => {
    let pedidos = 0;
    const p: ProvedorGeo = {
      nome: 'falso',
      geocodificar: async (_q, perto) => {
        pedidos++;
        return perto ? [lugar('Rua São Paulo', -18.01, -49.35)] : [lugar('Rua São Paulo', -23.5, -46.6)];
      },
      lugares: async () => [],
      enderecoDoPonto: async () => null,
      rota: async () => null,
    };
    const g = GeoService.comProvedor(uso(), p);
    const r = await g.buscar('Rua Sao Paulo', -18.0128, -49.3556);
    expect(r[0].distanceKm).toBeLessThan(80);
    expect(r.some((l) => (l.distanceKm ?? 0) > 500)).toBe(true);
    const antes = pedidos;
    await g.buscar('rua são paulo', -18.0128, -49.3556);
    expect(pedidos).toBe(antes);
  });

  it('TomTom no limite: busca devolve MAPA_LIMITE (o app mostra a contingencia)', async () => {
    const p: ProvedorGeo = {
      nome: 'falso',
      geocodificar: async () => {
        throw new LimiteDoMapa(429);
      },
      lugares: async () => [],
      enderecoDoPonto: async () => {
        throw new LimiteDoMapa(429);
      },
      rota: async () => null,
    };
    const g = GeoService.comProvedor(uso(), p);
    await expect(g.buscar('Rua A', -18, -49)).rejects.toMatchObject({ response: { code: 'MAPA_LIMITE' } });
    const e = await g.endereco(-18, -49);
    expect(e.limite).toBe(true);
    expect(g.parado()).toBe(true);
  });

  it('sem chave: busca em contingencia, rota em linha reta (null)', async () => {
    const g = GeoService.comProvedor(uso(), null);
    await expect(g.buscar('Rua A', -18, -49)).rejects.toMatchObject({ response: { code: 'MAPA_LIMITE' } });
    expect(await g.rota({ latitude: -18, longitude: -49 }, { latitude: -18.1, longitude: -49.1 })).toBeNull();
  });

  it('rota da corrida: pedida uma vez, as outras vem do guardado', async () => {
    let pedidos = 0;
    const p: ProvedorGeo = {
      nome: 'falso',
      geocodificar: async () => [],
      lugares: async () => [],
      enderecoDoPonto: async () => null,
      rota: async () => {
        pedidos++;
        return { distanceMeters: 1500, durationSeconds: 240, pontos: [[-18, -49], [-18.01, -49.01]] };
      },
    };
    const g = GeoService.comProvedor(uso(), p);
    const a = { latitude: -18.0125, longitude: -49.3547 };
    const b = { latitude: -18.005, longitude: -49.361 };
    await g.rota(a, b); // orcamento
    await g.rota(a, b); // pedido da corrida
    await g.rota(a, b, false); // desenho no app do passageiro e do motorista
    expect(pedidos).toBe(1);
  });
});
