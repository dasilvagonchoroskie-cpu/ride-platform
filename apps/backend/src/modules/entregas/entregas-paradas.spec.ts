import { EntregasService } from './entregas.service';

/**
 * Varias entregas num pedido (13/11/2026): cada parada do caminho tem o proprio
 * codigo, e a ultima entrega so vale depois das anteriores, na ordem da rota.
 */
function montar(paradas: Array<{ sequencia: number; codigo: string; tentativas?: number; entregueEm?: Date | null }>) {
  const linhas = paradas.map((p) => ({
    sequencia: p.sequencia,
    descricao: `item ${p.sequencia}`,
    destinatarioNome: `Pessoa ${p.sequencia}`,
    destinatarioTelefone: '',
    codigo: p.codigo,
    tentativas: p.tentativas ?? 0,
    entregueEm: p.entregueEm ?? null,
  }));
  const sqls: Array<{ sql: string; args: unknown[] }> = [];
  const prisma = {
    $queryRawUnsafe: jest.fn(async () => linhas),
    $executeRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      sqls.push({ sql, args });
      if (sql.includes('"entregue_em" = now()')) {
        const l = linhas.find((x) => x.sequencia === args[1]);
        if (l) l.entregueEm = new Date();
      }
      if (sql.includes('"tentativas" = "tentativas" + 1')) {
        const l = linhas.find((x) => x.sequencia === args[1]);
        if (l) l.tentativas += 1;
      }
      return 1;
    }),
  };
  const s = new EntregasService(prisma as never, {} as never);
  return { s, linhas, sqls };
}

describe('Entregas com varias paradas', () => {
  it('entrega a parada 1 com o codigo certo e marca a chegada na rota', async () => {
    const { s, linhas, sqls } = montar([{ sequencia: 1, codigo: '1234' }, { sequencia: 2, codigo: '5678' }]);
    await s.entregarParada('r1', 1, '1234');
    expect(linhas[0].entregueEm).not.toBeNull();
    expect(sqls.some((q) => q.sql.includes('"ride_stops"') && q.sql.includes('"arrived_at"'))).toBe(true);
  });

  it('exige a ordem da rota: nao entrega a 2 antes da 1', async () => {
    const { s, linhas } = montar([{ sequencia: 1, codigo: '1234' }, { sequencia: 2, codigo: '5678' }]);
    await expect(s.entregarParada('r1', 2, '5678')).rejects.toThrow('Entregue primeiro a parada 1');
    expect(linhas[1].entregueEm).toBeNull();
  });

  it('codigo errado conta tentativa e recusa; o codigo de OUTRA parada nao vale', async () => {
    const { s, linhas } = montar([{ sequencia: 1, codigo: '1234' }, { sequencia: 2, codigo: '5678' }]);
    await expect(s.entregarParada('r1', 1, '5678')).rejects.toThrow('Código errado');
    expect(linhas[0].tentativas).toBe(1);
    expect(linhas[0].entregueEm).toBeNull();
  });

  it('depois de 5 erros trava e manda falar com a Central', async () => {
    const { s } = montar([{ sequencia: 1, codigo: '1234', tentativas: 5 }]);
    await expect(s.entregarParada('r1', 1, '1234')).rejects.toThrow('Central');
  });

  it('parada que nao existe e toque repetido em parada ja entregue', async () => {
    const { s, sqls } = montar([{ sequencia: 1, codigo: '1234', entregueEm: new Date() }]);
    await expect(s.entregarParada('r1', 3, '1234')).rejects.toThrow('não existe');
    const antes = sqls.length;
    await s.entregarParada('r1', 1, '0000'); // ja entregue: nao faz nada
    expect(sqls.length).toBe(antes);
  });

  it('a ultima entrega (e o fim da corrida) so vale com todas as anteriores entregues', async () => {
    const { s } = montar([{ sequencia: 1, codigo: '1234', entregueEm: new Date() }, { sequencia: 2, codigo: '5678' }]);
    await expect(s.exigirParadasEntregues('r1')).rejects.toThrow('Falta entregar a parada 2');
    const ok = montar([{ sequencia: 1, codigo: '1234', entregueEm: new Date() }]);
    await expect(ok.s.exigirParadasEntregues('r1')).resolves.toBeUndefined();
    const sem = montar([]);
    await expect(sem.s.exigirParadasEntregues('r1')).resolves.toBeUndefined(); // entrega unica: nada muda
  });

  it('o codigo nunca vai para o motorista; as tentativas so para a Central', () => {
    const { s, linhas } = montar([{ sequencia: 1, codigo: '1234' }]);
    expect(s.publicoParadas(linhas as never, 'motorista')[0]).not.toHaveProperty('codigo');
    expect(s.publicoParadas(linhas as never, 'cliente')[0]).toMatchObject({ codigo: '1234' });
    expect(s.publicoParadas(linhas as never, 'cliente')[0]).not.toHaveProperty('tentativas');
    expect(s.publicoParadas(linhas as never, 'central')[0]).toMatchObject({ codigo: '1234', tentativas: 0 });
  });

  it('cria as paradas com codigo de 4 numeros cada e telefone opcional', async () => {
    const { s, sqls } = montar([]);
    const tx = { $executeRawUnsafe: jest.fn(async (_s: string, ...a: unknown[]) => void sqls.push({ sql: _s, args: a })) };
    await s.criarParadas(tx as never, 'r1', [
      { sequencia: 1, descricao: 'a', destinatarioNome: 'Ana', destinatarioTelefone: '' },
      { sequencia: 2, descricao: 'b', destinatarioNome: 'Beto', destinatarioTelefone: '(64) 98888-7777' },
    ]);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const [c1, c2] = tx.$executeRawUnsafe.mock.calls.map((c) => c as unknown[]);
    expect(String(c1[6])).toMatch(/^\d{4}$/);
    expect(String(c2[6])).toMatch(/^\d{4}$/);
    expect(c1[5]).toBe('');
    expect(c2[5]).toBe('5564988887777');
  });
});
