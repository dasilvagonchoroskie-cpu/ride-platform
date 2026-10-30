import { UserRole } from '@ride/shared';
import { CHAVE_AVISOS } from '../../modules/operacao/operacao.store';
import { CaixaDeEntradaService, DIAS_NA_CAIXA } from './caixa-de-entrada.service';

type Linha = {
  id: string;
  userId: string;
  channel: string;
  status: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  sentAt?: Date | null;
};

type Onde = {
  id?: string | { in: string[] };
  userId?: string;
  channel?: string;
  readAt?: null;
  createdAt?: { gte?: Date; lt?: Date };
  data?: { path: string[]; equals: unknown };
  OR?: Onde[];
};

/** Banco de mentira: tabela de notificacoes, contas e settings. */
function banco() {
  const linhas: Linha[] = [];
  const contas = new Map<string, { metadata: Record<string, unknown> | null }>();
  const settings = new Map<string, unknown>();
  let seq = 0;
  const casa = (n: Linha, w: Onde): boolean => {
    if (w.userId && n.userId !== w.userId) return false;
    if (w.channel && n.channel !== w.channel) return false;
    if (typeof w.id === 'string' && n.id !== w.id) return false;
    if (w.id && typeof w.id === 'object' && !w.id.in.includes(n.id)) return false;
    if (w.readAt === null && n.readAt !== null) return false;
    if (w.createdAt?.gte && n.createdAt < w.createdAt.gte) return false;
    if (w.createdAt?.lt && !(n.createdAt < w.createdAt.lt)) return false;
    if (w.data && (n.data ?? {})[w.data.path[0]] !== w.data.equals) return false;
    if (w.OR && !w.OR.some((o) => casa(n, o))) return false;
    return true;
  };
  const prisma = {
    notification: {
      create: async ({ data }: { data: Omit<Linha, 'id' | 'readAt' | 'createdAt'> & { createdAt?: Date } }) => {
        const l: Linha = { id: `n${++seq}`, readAt: null, createdAt: data.createdAt ?? new Date(), ...data } as Linha;
        linhas.push(l);
        return { id: l.id };
      },
      createMany: async ({ data }: { data: Array<Omit<Linha, 'id' | 'readAt'>> }) => {
        for (const d of data) linhas.push({ id: `n${++seq}`, readAt: null, ...d } as Linha);
        return { count: data.length };
      },
      findMany: async ({ where }: { where: Onde }) =>
        linhas.filter((n) => casa(n, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      count: async ({ where }: { where: Onde }) => linhas.filter((n) => casa(n, where)).length,
      updateMany: async ({ where, data }: { where: Onde; data: Partial<Linha> }) => {
        const alvo = linhas.filter((n) => casa(n, where));
        for (const n of alvo) Object.assign(n, data);
        return { count: alvo.length };
      },
      deleteMany: async ({ where }: { where: Onde }) => {
        const antes = linhas.length;
        for (let i = linhas.length - 1; i >= 0; i--) if (casa(linhas[i], where)) linhas.splice(i, 1);
        return { count: antes - linhas.length };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => contas.get(where.id) ?? null,
    },
    driver: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'motorista-1' ? { userId: 'conta-motorista' } : null),
    },
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) => (settings.has(where.key) ? { value: settings.get(where.key) } : null),
    },
    // UPDATE users SET metadata.avisosAte = $1 WHERE id = $2 AND avisosAte = $3 (troca so se ninguem trocou antes)
    $executeRaw: async (_sql: TemplateStringsArray, novoAte: string, userId: string, antes: string) => {
      const c = contas.get(userId);
      if (!c) return 0;
      const atual = (c.metadata?.avisosAte as string | undefined) ?? '';
      if (atual !== antes) return 0;
      c.metadata = { ...(c.metadata ?? {}), avisosAte: novoAte };
      return 1;
    },
  };
  const enviados: Array<{ userId: string; data: Record<string, string> }> = [];
  const push = { paraUsuario: (userId: string, data: Record<string, string>) => enviados.push({ userId, data }) };
  const caixa = new CaixaDeEntradaService(prisma as never, push as never);
  return { caixa, linhas, contas, settings, enviados };
}

const motorista = { id: 'conta-motorista', role: UserRole.DRIVER };
const outro = { id: 'conta-outra', role: UserRole.DRIVER };
const passageiro = { id: 'conta-passageiro', role: UserRole.PASSENGER };

describe('Caixa de notificacoes (sino) — 30/10/2026', () => {
  it('ler: lista as da conta e conta as nao lidas pelo servidor', async () => {
    const b = banco();
    await b.caixa.avisarMotorista('motorista-1', 'Recarga confirmada', '+R$ 20,00 na sua carteira.', { tipo: 'carteira', abrir: 'carteira' });
    await b.caixa.avisar(outro.id, 'De outra conta', 'nao aparece', { tipo: 'conta' });
    const r = await b.caixa.listar(motorista);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ titulo: 'Recarga confirmada', abrir: 'carteira', tipo: 'carteira', lida: false });
    expect(r.naoLidas).toBe(1);
    expect(b.enviados[0]).toMatchObject({ userId: 'conta-motorista', data: { tipo: 'aviso', titulo: 'Recarga confirmada' } });
  });

  it('abrir a lista e marcar como lidas: o ponto some e nao volta sozinho', async () => {
    const b = banco();
    await b.caixa.avisar(motorista.id, 'Carro aprovado', 'ok', { tipo: 'carro' });
    await b.caixa.avisar(motorista.id, 'Documento aprovado', 'ok', { tipo: 'documento' });
    expect((await b.caixa.naoLidas(motorista)).naoLidas).toBe(2);
    expect((await b.caixa.marcarLidas(motorista.id)).naoLidas).toBe(0);
    // Pergunta de novo (como o app faz de tempos em tempos): continua 0.
    expect((await b.caixa.naoLidas(motorista)).naoLidas).toBe(0);
    expect((await b.caixa.listar(motorista)).itens.every((i) => i.lida)).toBe(true);
    // So uma nova faz o ponto voltar.
    await b.caixa.avisar(motorista.id, 'Saque pago', 'ok', { tipo: 'saque' });
    expect((await b.caixa.naoLidas(motorista)).naoLidas).toBe(1);
  });

  it('marcar lidas so as ids, e so da propria conta', async () => {
    const b = banco();
    await b.caixa.avisar(motorista.id, 'A', 'a', { tipo: 'x' });
    await b.caixa.avisar(outro.id, 'B', 'b', { tipo: 'x' });
    const idDoOutro = b.linhas.find((l) => l.userId === outro.id)!.id;
    await b.caixa.marcarLidas(motorista.id, [idDoOutro]);
    expect(b.linhas.find((l) => l.id === idDoOutro)!.readAt).toBeNull();
  });

  it('apagar uma: some so da conta dela; de outra conta nao apaga', async () => {
    const b = banco();
    await b.caixa.avisar(motorista.id, 'A', 'a', { tipo: 'x' });
    await b.caixa.avisar(outro.id, 'B', 'b', { tipo: 'x' });
    const [minha, doOutro] = [b.linhas[0].id, b.linhas[1].id];
    expect((await b.caixa.apagar(motorista.id, [doOutro])).apagadas).toBe(0);
    expect(b.linhas).toHaveLength(2);
    expect((await b.caixa.apagar(motorista.id, [minha])).apagadas).toBe(1);
    expect(b.linhas.map((l) => l.userId)).toEqual([outro.id]);
  });

  it('apagar todas: so as da conta; com ids, nao leva a que chegou depois', async () => {
    const b = banco();
    await b.caixa.avisar(motorista.id, 'A', 'a', { tipo: 'x' });
    await b.caixa.avisar(motorista.id, 'B', 'b', { tipo: 'x' });
    await b.caixa.avisar(outro.id, 'C', 'c', { tipo: 'x' });
    const vistas = b.linhas.filter((l) => l.userId === motorista.id).map((l) => l.id);
    await b.caixa.avisar(motorista.id, 'Nova', 'chegou depois', { tipo: 'x' });
    const r = await b.caixa.apagar(motorista.id, vistas);
    expect(r).toEqual({ apagadas: 2, naoLidas: 1 });
    expect((await b.caixa.apagar(motorista.id)).apagadas).toBe(1);
    expect(b.linhas.map((l) => l.title)).toEqual(['C']);
  });

  it('mais de 30 dias: some sozinha (e nao aparece nem conta antes disso)', async () => {
    const b = banco();
    const agora = Date.now();
    await b.caixa.avisar(motorista.id, 'Nova', 'n', { tipo: 'x' });
    b.linhas.push({
      id: 'velha', userId: motorista.id, channel: 'PUSH', status: 'SENT', title: 'Velha', body: 'v', data: null,
      readAt: null, createdAt: new Date(agora - (DIAS_NA_CAIXA + 1) * 86_400_000),
    });
    expect((await b.caixa.listar(motorista)).itens.map((i) => i.titulo)).toEqual(['Nova']);
    expect((await b.caixa.naoLidas(motorista)).naoLidas).toBe(1);
    expect(await b.caixa.limparAntigas(agora)).toBe(1);
    expect(b.linhas.map((l) => l.id)).not.toContain('velha');
    // Roda uma vez por hora.
    expect(await b.caixa.limparAntigas(agora + 60_000)).toBe(0);
  });

  it('aviso da Central entra uma vez na caixa do passageiro; apagado, nao volta', async () => {
    const b = banco();
    b.contas.set(passageiro.id, { metadata: { contatosEmergencia: ['x'] } });
    const criado = new Date(Date.now() - 3600_000).toISOString();
    b.settings.set(CHAVE_AVISOS, [{ id: 'av1', titulo: 'Promoção', texto: '10% hoje', criadoEm: criado }]);
    let r = await b.caixa.listar(passageiro);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ titulo: 'Promoção', tipo: 'aviso-central', lida: false });
    expect(r.naoLidas).toBe(1);
    // Abrir de novo nao duplica; a marca nao apaga o resto da conta.
    r = await b.caixa.listar(passageiro);
    expect(r.itens).toHaveLength(1);
    expect(b.contas.get(passageiro.id)!.metadata).toMatchObject({ contatosEmergencia: ['x'], avisosAte: criado });
    await b.caixa.apagar(passageiro.id);
    expect((await b.caixa.listar(passageiro)).itens).toHaveLength(0);
    // Aviso novo da Central: so ele entra.
    const novo = new Date().toISOString();
    b.settings.set(CHAVE_AVISOS, [{ id: 'av2', titulo: 'Chuva', texto: 'Cuidado', criadoEm: novo }, { id: 'av1', titulo: 'Promoção', texto: '10% hoje', criadoEm: criado }]);
    expect((await b.caixa.listar(passageiro)).itens.map((i) => i.titulo)).toEqual(['Chuva']);
  });

  it('marca perdida: nao repete aviso que ja esta na caixa', async () => {
    const b = banco();
    b.contas.set(passageiro.id, { metadata: null });
    b.settings.set(CHAVE_AVISOS, [{ id: 'av1', titulo: 'Promoção', texto: 't', criadoEm: new Date().toISOString() }]);
    await b.caixa.listar(passageiro);
    b.contas.get(passageiro.id)!.metadata = {}; // outra gravacao apagou a marca
    expect((await b.caixa.listar(passageiro)).itens).toHaveLength(1);
  });

  it('a Central tira o aviso: some da caixa de todos', async () => {
    const b = banco();
    b.contas.set(passageiro.id, { metadata: null });
    b.settings.set(CHAVE_AVISOS, [{ id: 'av1', titulo: 'Errado', texto: 't', criadoEm: new Date().toISOString() }]);
    await b.caixa.listar(passageiro);
    expect(await b.caixa.tirarAvisoDaCentral('av1')).toBe(1);
    b.settings.set(CHAVE_AVISOS, []);
    expect((await b.caixa.listar(passageiro)).itens).toHaveLength(0);
  });

  it('motorista nao recebe os avisos dos passageiros', async () => {
    const b = banco();
    b.contas.set(motorista.id, { metadata: null });
    b.settings.set(CHAVE_AVISOS, [{ id: 'av1', titulo: 'Promoção', texto: 't', criadoEm: new Date().toISOString() }]);
    expect((await b.caixa.listar(motorista)).itens).toHaveLength(0);
  });
});
