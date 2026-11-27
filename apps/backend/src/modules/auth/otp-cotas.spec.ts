// Limites do codigo de acesso: cotas e tentativas por quem pede e por conta.
import { OtpPurpose } from '@ride/shared';
import { OtpService } from './otp.service';
import { origemDoPedido } from './origem-do-pedido';
import { LIMITE_DE_CODIGOS } from './limites-de-codigo';

type Linha = Record<string, any>;

function combina(linha: Linha, where: Linha): boolean {
  return Object.entries(where).every(([campo, filtro]) => {
    const v = linha[campo];
    if (filtro === null) return v === null;
    if (filtro && typeof filtro === 'object' && !(filtro instanceof Date)) {
      if ('gte' in filtro) return v >= filtro.gte;
      if ('gt' in filtro) return v > filtro.gt;
      if ('lt' in filtro) return v < filtro.lt;
    }
    return v === filtro;
  });
}

let contador = 0;

function montar(casa: { conexoes?: string[]; aparelhos?: string[] } = {}) {
  const linhas: Linha[] = [];
  const enviados: string[] = [];
  const novas = (where: Linha) => linhas.filter((l) => combina(l, where)).sort((a, b) => b.createdAt - a.createdAt || b.ordem - a.ordem);
  const otpCode = {
    findFirst: async ({ where }: { where: Linha }) => novas(where)[0] ?? null,
    count: async ({ where }: { where: Linha }) => novas(where).length,
    updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
      const achadas = novas(where);
      for (const l of achadas) {
        if (data.attempts?.increment) l.attempts += 1;
        if (data.consumedAt) l.consumedAt = data.consumedAt;
      }
      return { count: achadas.length };
    },
    create: async ({ data }: { data: Linha }) => {
      contador += 1;
      const l = { id: `codigo-${contador}`, ordem: contador, attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
      linhas.push(l);
      return l;
    },
  };
  // So a conta da Ana existe; "casa" diz de onde ela ja entrou.
  const user = {
    findUnique: async () => null,
    findFirst: async ({ where }: { where: Linha }) => (where.email === 'ana@exemplo.com' ? { id: 'ana' } : null),
  };
  const device = {
    findUnique: async ({ where }: { where: Linha }) =>
      casa.aparelhos?.includes(where.userId_deviceId.deviceId) ? { id: 'linha' } : null,
  };
  const refreshToken = { findMany: async () => (casa.conexoes ?? []).map((ip) => ({ ip })) };
  const prisma = { otpCode, user, device, refreshToken, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) };
  const config = { jwt: { refreshSecret: 'pimenta' }, otp: { chaveTeste: '', debugReturn: true, length: 6, ttlSeconds: 300, maxAttempts: 5 } };
  const notifications = { emailConfigurado: false, send: async () => ({ delivered: true }), sendOtpCode: async (_: string, c: string) => enviados.push(c) };
  const otp = new OtpService(prisma as never, config as never, notifications as never);
  /** Faz de conta que passou um tempo: as linhas ficam mais antigas. */
  const envelhecer = (ms: number) => {
    for (const l of linhas) {
      l.createdAt = new Date(l.createdAt.getTime() - ms);
      l.expiresAt = new Date(l.expiresAt.getTime() - ms);
    }
  };
  const pedir = async (ip: string | undefined, email = 'ana@exemplo.com', instalacao?: string) =>
    (await otp.request({ email, purpose: OtpPurpose.LOGIN }, ip, undefined, instalacao)).debugCode!;
  const conferir = (ip: string | undefined, code: string, email = 'ana@exemplo.com') =>
    otp.verify({ email, purpose: OtpPurpose.LOGIN, code, ip });
  return { otp, linhas, pedir, conferir, envelhecer };
}

const errado = (certo: string) => (certo === '000000' ? '111111' : '000000');
const DONA = '10.0.0.1';
const OUTRO = '10.0.0.2';
const UM_MINUTO = 61_000;

describe('Origem do pedido', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8:aa:bb:1:2:3:4', '2001:db8:aa:bb::/64'],
    ['2001:0DB8:00aa:00bb:ffff:ffff:ffff:ffff', '2001:db8:aa:bb::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
  ])('%s', (entrada, saida) => expect(origemDoPedido(entrada)).toBe(saida));

  it('sem endereco', () => {
    expect(origemDoPedido(undefined)).toBeUndefined();
    expect(origemDoPedido('  ')).toBeUndefined();
  });
});

describe('Cotas do codigo de acesso', () => {
  it('cada pessoa tem a propria cota por conta', async () => {
    const { pedir, conferir, envelhecer } = montar();
    for (let i = 0; i < LIMITE_DE_CODIGOS.porPessoaEContaNaHora; i++) {
      await pedir(OUTRO);
      envelhecer(UM_MINUTO);
    }
    await expect(pedir(OUTRO)).rejects.toThrow('Muitos codigos');
    const meu = await pedir(DONA);
    await expect(conferir(DONA, meu)).resolves.toBeUndefined();
  });

  it('a espera de 1 minuto e de cada pessoa', async () => {
    const { pedir } = montar();
    await pedir(OUTRO);
    await expect(pedir(DONA)).resolves.toMatch(/^\d{6}$/);
    await expect(pedir(DONA)).rejects.toThrow('Aguarde');
  });

  it('os codigos de cada pessoa convivem', async () => {
    const { pedir, conferir, envelhecer } = montar();
    const meu = await pedir(DONA);
    envelhecer(UM_MINUTO);
    await pedir(OUTRO);
    await expect(conferir(DONA, meu)).resolves.toBeUndefined();
  });

  it('pedir de novo apaga o MEU codigo anterior', async () => {
    const { pedir, conferir, envelhecer, linhas } = montar();
    const velho = await pedir(DONA);
    envelhecer(UM_MINUTO);
    await pedir(DONA);
    expect(linhas.filter((l) => !l.consumedAt)).toHaveLength(1);
    await expect(conferir(DONA, velho)).rejects.toThrow();
  });

  it('as tentativas de quem pediu e as de fora tem contagens separadas', async () => {
    const { pedir, conferir } = montar();
    const meu = await pedir(DONA);
    for (let i = 0; i < 5; i++) await expect(conferir(OUTRO, errado(meu))).rejects.toThrow('incorreto');
    await expect(conferir(OUTRO, errado(meu))).rejects.toThrow('tentativas');
    await expect(conferir(OUTRO, meu)).rejects.toThrow('tentativas');
    await expect(conferir(DONA, meu)).resolves.toBeUndefined();
  });

  it('de fora, mesmo ao mesmo tempo, so 5 sao conferidas', async () => {
    const { pedir, conferir } = montar();
    const meu = await pedir(DONA);
    const r = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => conferir(`10.1.0.${i}`, errado(meu))));
    expect(r.filter((x) => x.status === 'rejected' && String(x.reason.message).includes('incorreto'))).toHaveLength(5);
  });

  it('quem pediu continua com so 5 tentativas', async () => {
    const { pedir, conferir } = montar();
    const meu = await pedir(DONA);
    for (let i = 0; i < 5; i++) await expect(conferir(DONA, errado(meu))).rejects.toThrow('incorreto');
    await expect(conferir(DONA, meu)).rejects.toThrow('tentativas');
  });

  it('trocou de rede depois de pedir: o codigo ainda entra', async () => {
    const { pedir, conferir } = montar();
    const meu = await pedir('2001:db8:1:1::5');
    await expect(conferir(DONA, meu)).resolves.toBeUndefined();
  });

  it('IPv6 do mesmo aparelho conta como a mesma pessoa', async () => {
    const { pedir, linhas } = montar();
    await pedir('2001:db8:1:1:aaaa::1');
    await expect(pedir('2001:db8:1:1:bbbb::2')).rejects.toThrow('Aguarde');
    expect(linhas).toHaveLength(1);
  });

  it('um codigo certo encerra todos os pendentes da conta', async () => {
    const { pedir, conferir, envelhecer, linhas } = montar();
    const meu = await pedir(DONA);
    envelhecer(UM_MINUTO);
    const doOutro = await pedir(OUTRO);
    await conferir(DONA, meu);
    expect(linhas.filter((l) => !l.consumedAt)).toHaveLength(0);
    await expect(conferir(OUTRO, doOutro)).rejects.toThrow('invalido ou expirado');
  });

  it('um codigo vencido da minha rede nao esconde o novo pedido em outra', async () => {
    const { pedir, conferir, envelhecer } = montar();
    await pedir(DONA);
    envelhecer(301_000);
    const novo = await pedir('10.0.0.9');
    await expect(conferir(DONA, novo)).resolves.toBeUndefined();
  });

  it('teto da conta por hora, somando todas as origens', async () => {
    const { pedir, envelhecer } = montar();
    for (let i = 0; i < LIMITE_DE_CODIGOS.porContaNaHora; i++) {
      await pedir(`10.2.0.${i}`);
      envelhecer(1000);
    }
    await expect(pedir(DONA)).rejects.toThrow('Muitos codigos');
    envelhecer(60 * 60 * 1000);
    await expect(pedir(DONA)).resolves.toMatch(/^\d{6}$/);
  });

  it('teto da conta por dia', async () => {
    const { pedir, envelhecer } = montar();
    for (let i = 0; i < LIMITE_DE_CODIGOS.porContaNoDia; i++) {
      await pedir(`10.3.0.${i}`);
      envelhecer(5 * 60 * 1000);
    }
    await expect(pedir(DONA)).rejects.toThrow('Muitos codigos');
  });

  it('uma origem nao pede codigo sem fim para contas diferentes', async () => {
    const { pedir } = montar();
    for (let i = 0; i < LIMITE_DE_CODIGOS.porPessoaNaHora; i++) await pedir(OUTRO, `p${i}@exemplo.com`);
    await expect(pedir(OUTRO, 'mais@exemplo.com')).rejects.toThrow('desta conexao');
    await expect(pedir(DONA, 'mais@exemplo.com')).resolves.toMatch(/^\d{6}$/);
  });

  it('sem saber a origem, vale o limite apertado pela conta', async () => {
    const { pedir, envelhecer } = montar();
    for (let i = 0; i < 6; i++) {
      await pedir(undefined);
      envelhecer(UM_MINUTO);
    }
    await expect(pedir(undefined)).rejects.toThrow('Muitos codigos');
  });

  it('muitos pedidos ao mesmo tempo da mesma pessoa: so um passa', async () => {
    const { pedir, linhas } = montar();
    const r = await Promise.allSettled(Array.from({ length: 20 }, () => pedir(DONA)));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(linhas).toHaveLength(1);
  });

  it('ao mesmo tempo, de muitas origens, o teto da conta vale', async () => {
    const { pedir, linhas } = montar();
    const r = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => pedir(`10.4.0.${i}`)));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(LIMITE_DE_CODIGOS.porContaNaHora);
    expect(linhas).toHaveLength(LIMITE_DE_CODIGOS.porContaNaHora);
  });

  it('ao mesmo tempo, para muitas contas, o teto da origem vale', async () => {
    const { pedir, linhas } = montar();
    const r = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => pedir(OUTRO, `q${i}@exemplo.com`)));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(LIMITE_DE_CODIGOS.porPessoaNaHora);
    expect(linhas).toHaveLength(LIMITE_DE_CODIGOS.porPessoaNaHora);
  });

  it('uma recusa nao trava a fila', async () => {
    const { pedir, envelhecer } = montar();
    await pedir(DONA);
    await expect(pedir(DONA)).rejects.toThrow('Aguarde');
    envelhecer(UM_MINUTO);
    await expect(pedir(DONA)).resolves.toMatch(/^\d{6}$/);
  });
});

describe('Quem ja entrou na conta nao divide o teto com quem e de fora', () => {
  const CELULAR = `and-${'c3'.repeat(16)}`;

  /** Gasta o teto da hora a partir de varias conexoes de fora. */
  async function encherDeFora(c: ReturnType<typeof montar>) {
    for (let volta = 0; volta < LIMITE_DE_CODIGOS.porPessoaEContaNaHora; volta++) {
      for (let i = 0; i < 4; i++) await c.pedir(`198.51.100.${i}`).catch(() => undefined);
      c.envelhecer(UM_MINUTO);
    }
    await expect(c.pedir('192.0.2.200')).rejects.toThrow('Muitos codigos');
  }

  it('conexao ja usada pela dona continua pedindo', async () => {
    const c = montar({ conexoes: [DONA] });
    await encherDeFora(c);
    await expect(c.pedir(DONA)).resolves.toMatch(/^\d+$/);
  });

  it('celular ja usado pela dona continua pedindo, mesmo de outra internet', async () => {
    const c = montar({ aparelhos: [CELULAR] });
    await encherDeFora(c);
    await expect(c.pedir('192.0.2.77', 'ana@exemplo.com', CELULAR)).resolves.toMatch(/^\d+$/);
  });

  it('conexao nova sem aparelho conhecido continua no teto', async () => {
    const c = montar({ conexoes: [DONA], aparelhos: [CELULAR] });
    await encherDeFora(c);
    await expect(c.pedir('192.0.2.78', 'ana@exemplo.com', `and-${'d4'.repeat(16)}`)).rejects.toThrow('Muitos codigos');
  });

  it('o conhecido mantem o limite por hora e tem limite por dia', async () => {
    const c = montar({ conexoes: [DONA] });
    let passaram = 0;
    for (let hora = 0; hora < 5; hora++) {
      let naHora = 0;
      for (let i = 0; i < 10; i++) {
        await c.pedir(DONA).then(() => { naHora += 1; }).catch(() => undefined);
        c.envelhecer(UM_MINUTO);
      }
      expect(naHora).toBeLessThanOrEqual(LIMITE_DE_CODIGOS.porPessoaEContaNaHora);
      passaram += naHora;
      c.envelhecer(60 * 60_000);
    }
    expect(passaram).toBe(LIMITE_DE_CODIGOS.porConhecidoNoDia);
  });
});
