import {
  apagarAviso,
  cidadeAtendida,
  gravarCidades,
  lerAvisos,
  lerCidades,
  limparCidades,
  publicarAviso,
  whatsappDaCentral,
  MAX_AVISOS,
  SettingsDb,
} from './operacao.store';

/** Tabela `settings` de mentira, so em memoria. */
function bancoFalso(inicial: Record<string, unknown> = {}): SettingsDb & { dados: Record<string, unknown> } {
  const dados: Record<string, unknown> = { ...inicial };
  return {
    dados,
    setting: {
      async findUnique({ where }) {
        return where.key in dados ? { value: dados[where.key] } : null;
      },
      async upsert({ where, update }) {
        dados[where.key] = update.value;
        return null;
      },
    },
  };
}

describe('cidades atendidas', () => {
  it('limpa espacos, vazios e repetidos sem mudar a ordem', () => {
    expect(limparCidades(['  Goiatuba - GO ', '', 'goiatuba -  go', 'Itumbiara - GO', 'Goiatúba - GO'])).toEqual([
      'Goiatuba - GO',
      'Itumbiara - GO',
    ]);
  });

  it('sem configuracao, a lista vem vazia (nada fixo no codigo)', async () => {
    expect(await lerCidades(bancoFalso())).toEqual([]);
  });

  it('acha a cidade ignorando maiusculas e acentos e devolve o nome oficial', async () => {
    const db = bancoFalso();
    await gravarCidades(db, ['Goiatuba - GO', 'Caldas Novas - GO'], 'admin');
    expect(await cidadeAtendida(db, 'goiatuba - go')).toBe('Goiatuba - GO');
    expect(await cidadeAtendida(db, 'Caldas novas - GO')).toBe('Caldas Novas - GO');
    expect(await cidadeAtendida(db, 'Rio Verde - GO')).toBeNull();
  });
});

describe('avisos para o passageiro', () => {
  it('publica o mais novo primeiro e apaga pelo id', async () => {
    const db = bancoFalso();
    await publicarAviso(db, 'Primeiro', 'texto 1', 'admin', new Date('2026-10-01T10:00:00Z'));
    const lista = await publicarAviso(db, 'Segundo', 'texto 2', 'admin', new Date('2026-10-02T10:00:00Z'));
    expect(lista.map((a) => a.titulo)).toEqual(['Segundo', 'Primeiro']);
    const depois = await apagarAviso(db, lista[0].id, 'admin');
    expect(depois.map((a) => a.titulo)).toEqual(['Primeiro']);
    expect((await lerAvisos(db)).length).toBe(1);
  });

  it(`guarda no maximo ${MAX_AVISOS} avisos`, async () => {
    const db = bancoFalso();
    for (let i = 0; i < MAX_AVISOS + 5; i += 1) {
      await publicarAviso(db, `Aviso ${i}`, 'texto', 'admin', new Date(Date.UTC(2026, 9, 1, 0, i)));
    }
    const lista = await lerAvisos(db);
    expect(lista.length).toBe(MAX_AVISOS);
    expect(lista[0].titulo).toBe(`Aviso ${MAX_AVISOS + 4}`);
  });

  it('ignora lixo gravado na tabela', async () => {
    const db = bancoFalso({ 'operacao.avisos': [{ id: 1 }, null, 'x'] });
    expect(await lerAvisos(db)).toEqual([]);
  });
});

describe('WhatsApp da Central', () => {
  it('usa o configurado; vazio de proposito continua vazio', async () => {
    expect(await whatsappDaCentral(bancoFalso({ 'central.contato': { whatsapp: '5564900000000' } }))).toBe(
      '5564900000000',
    );
    expect(await whatsappDaCentral(bancoFalso({ 'central.contato': { whatsapp: null } }))).toBeNull();
  });
});
