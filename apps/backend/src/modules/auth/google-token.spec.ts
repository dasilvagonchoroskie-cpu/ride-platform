import { generateKeyPairSync, sign } from 'crypto';
import { ChavesDoGoogle, GoogleForaDoAr, TokenGoogleRecusado, lerContaGoogle, ligacaoGoogle } from './google-token';

/** Comprovantes assinados de verdade, com uma chave criada so para o teste. */
const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const outro = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLIENTE = '123456789012-abcdefgh.apps.googleusercontent.com';
const AGORA = Date.parse('2026-11-27T12:00:00Z');
const S = Math.floor(AGORA / 1000);

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const base = {
  iss: 'https://accounts.google.com',
  aud: CLIENTE,
  sub: '109876543210',
  email: 'Pessoa.Teste@gmail.com',
  email_verified: true,
  name: 'Pessoa de Teste',
  iat: S - 10,
  exp: S + 3600,
};
function token(dados: Record<string, unknown> = {}, cab: Record<string, unknown> = {}, chave = par.privateKey) {
  const corpo = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...cab })}.${b64({ ...base, ...dados })}`;
  return `${corpo}.${sign('RSA-SHA256', Buffer.from(corpo), chave).toString('base64url')}`;
}
const chaves = { chave: async (kid: string) => (kid === 'k1' ? par.publicKey : null) };
const ler = (t: string) => lerContaGoogle(t, CLIENTE, chaves, AGORA);

describe('Comprovante do Google', () => {
  it('aceita o comprovante certo e devolve o e-mail em minusculas', async () => {
    await expect(ler(token())).resolves.toEqual({ sub: '109876543210', email: 'pessoa.teste@gmail.com', nome: 'Pessoa de Teste', autoritativo: true });
    await expect(ler(token({ iss: 'accounts.google.com' }))).resolves.toBeTruthy();
  });

  it.each([
    ['feito para outro aplicativo', { aud: '999-outro.apps.googleusercontent.com' }],
    ['lista no destinatario', { aud: [CLIENTE] }],
    ['de outro emissor', { iss: 'https://accounts.google.com.exemplo.com' }],
    ['vencido', { exp: S - 120 }],
    ['sem validade', { exp: undefined }],
    ['com data no futuro', { iat: S + 3600 }],
    ['sem codigo da conta', { sub: '' }],
    ['com e-mail nao confirmado', { email_verified: false }],
    ['sem e-mail', { email: undefined }],
  ])('recusa comprovante %s', async (_nome, dados) => {
    await expect(ler(token(dados))).rejects.toThrow(TokenGoogleRecusado);
  });

  it('recusa assinatura de outra chave, dados trocados, chave desconhecida e formato errado', async () => {
    await expect(ler(token({}, {}, outro.privateKey))).rejects.toThrow('assinatura');
    const [c, , a] = token().split('.');
    await expect(ler(`${c}.${b64({ ...base, email: 'outra@gmail.com' })}.${a}`)).rejects.toThrow('assinatura');
    await expect(ler(token({}, { kid: 'k2' }))).rejects.toThrow('chave desconhecida');
    await expect(ler('abc.def')).rejects.toThrow(TokenGoogleRecusado);
    await expect(ler(`${'a'.repeat(5000)}.b.c`)).rejects.toThrow(TokenGoogleRecusado);
  });

  it('nao aceita que o token escolha o algoritmo', async () => {
    const semAssinatura = `${b64({ alg: 'none', kid: 'k1' })}.${b64(base)}.x`;
    await expect(ler(semAssinatura)).rejects.toThrow('algoritmo');
    await expect(ler(token({}, { alg: 'HS256' }))).rejects.toThrow('algoritmo');
  });

  it('sem codigo do cliente configurado, nada vale', async () => {
    await expect(lerContaGoogle(token(), '', chaves, AGORA)).rejects.toThrow(TokenGoogleRecusado);
  });

  it('Google so e autoridade para Gmail ou conta de empresa (hd)', async () => {
    await expect(ler(token({ email: 'x@hotmail.com' }))).resolves.toMatchObject({ autoritativo: false });
    await expect(ler(token({ email: 'x@gmail.com.br' }))).resolves.toMatchObject({ autoritativo: false });
    await expect(ler(token({ email: 'x@empresa.com.br', hd: 'empresa.com.br' }))).resolves.toMatchObject({ autoritativo: true });
  });

  it('a ligacao so vale enquanto o e-mail da conta for o mesmo', () => {
    const metadata = { google: { sub: '1', email: 'a@gmail.com', ligadoEm: 'x' } };
    expect(ligacaoGoogle({ email: 'A@gmail.com', metadata })?.sub).toBe('1');
    expect(ligacaoGoogle({ email: 'b@gmail.com', metadata })).toBeNull();
    expect(ligacaoGoogle({ email: null, metadata })).toBeNull();
    expect(ligacaoGoogle({ email: 'a@gmail.com', metadata: null })).toBeNull();
  });
});

describe('Chaves publicas do Google', () => {
  const jwk = { ...(par.publicKey.export({ format: 'jwk' }) as Record<string, string>), kid: 'k1', use: 'sig', alg: 'RS256' };
  const resposta = (keys: unknown[], ok = true) =>
    ({ ok, json: async () => ({ keys }), headers: new Headers({ 'cache-control': 'public, max-age=600' }) }) as unknown as Response;

  it('busca uma vez, guarda pelo tempo que o Google mandar e nao deixa chave inventada forcar buscas', async () => {
    let agora = 1_000_000;
    const baixar = jest.fn(async () => resposta([jwk]));
    const c = new ChavesDoGoogle(baixar as never, () => agora);
    const [a, b] = await Promise.all([c.chave('k1'), c.chave('k1')]);
    expect(a && b).toBeTruthy();
    expect(baixar).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) await expect(c.chave(`falsa-${i}`)).resolves.toBeNull();
    expect(baixar).toHaveBeenCalledTimes(1);
    agora += 601_000;
    await c.chave('k1');
    expect(baixar).toHaveBeenCalledTimes(2);
  });

  it('sem rede usa as guardadas por ate um dia; sem nenhuma, avisa que o Google esta fora', async () => {
    let agora = 1_000_000;
    let cair = false;
    const baixar = jest.fn(async () => {
      if (cair) throw new Error('rede');
      return resposta([jwk]);
    });
    const c = new ChavesDoGoogle(baixar as never, () => agora);
    await c.chave('k1');
    cair = true;
    agora += 3600_000;
    await expect(c.chave('k1')).resolves.toBeTruthy();
    agora += 25 * 3600_000;
    await expect(c.chave('k1')).rejects.toThrow(GoogleForaDoAr);
  });
});
