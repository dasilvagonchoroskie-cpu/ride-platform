import { createHash } from 'crypto';
import { base32, cifrar, codigoTotp, conferirTotp, deBase32, decifrar, DoisFatoresService, linkDoAutenticador, passoDoTotp } from './dois-fatores';

describe('Verificacao em duas etapas (TOTP, Google Authenticator)', () => {
  const rfc = Buffer.from('12345678901234567890', 'ascii');

  it('bate com os vetores da RFC 6238 (SHA-1, 8 numeros)', () => {
    expect(codigoTotp(rfc, 59_000, 8)).toBe('94287082');
    expect(codigoTotp(rfc, 1_111_111_109_000, 8)).toBe('07081804');
    expect(codigoTotp(rfc, 1_111_111_111_000, 8)).toBe('14050471');
    expect(codigoTotp(rfc, 1_234_567_890_000, 8)).toBe('89005924');
    expect(codigoTotp(rfc, 2_000_000_000_000, 8)).toBe('69279037');
  });

  it('aceita o codigo de 30 s antes ou depois e recusa o resto', () => {
    const agora = 1_700_000_000_000;
    expect(conferirTotp(rfc, codigoTotp(rfc, agora), agora)).toBe(true);
    expect(conferirTotp(rfc, codigoTotp(rfc, agora - 30_000), agora)).toBe(true);
    expect(conferirTotp(rfc, codigoTotp(rfc, agora + 30_000), agora)).toBe(true);
    expect(conferirTotp(rfc, codigoTotp(rfc, agora - 120_000), agora)).toBe(false);
    expect(conferirTotp(rfc, '12345', agora)).toBe(false);
  });

  it('base32 vai e volta (o que o Google Authenticator digita)', () => {
    const b = Buffer.from('ola fortaleza mov 123', 'utf8');
    expect(deBase32(base32(b)).equals(b)).toBe(true);
    expect(deBase32('gezd gnbv').toString()).toBe(deBase32('GEZDGNBV').toString());
    expect(linkDoAutenticador('ABCD', 'dono@exemplo.com')).toContain('otpauth://totp/Fortaleza%20Mov%3Adono%40exemplo.com?secret=ABCD');
  });

  it('o segredo guardado vai cifrado e nao abre com outra chave nem alterado', () => {
    const g = cifrar('SEGREDO', 'chave-mestra-de-teste-com-32-letras!!');
    expect(g).not.toContain('SEGREDO');
    expect(decifrar(g, 'chave-mestra-de-teste-com-32-letras!!')).toBe('SEGREDO');
    expect(() => decifrar(g, 'outra-chave-mestra-de-teste-32-letras')).toThrow();
    const partes = g.split('.');
    partes[3] = Buffer.from('xxxx').toString('base64');
    expect(() => decifrar(partes.join('.'), 'chave-mestra-de-teste-com-32-letras!!')).toThrow();
  });

  it('desafio do login: vale 5 minutos e nao aceita alteracao', () => {
    const s = new DoisFatoresService({} as never, { jwt: { accessSecret: 'chave-mestra-de-teste-com-32-letras!!' } } as never);
    const d = s.criarDesafio('usuario-1', 1_000_000);
    expect(s.lerDesafio(d, 1_000_000 + 60_000)).toBe('usuario-1');
    expect(() => s.lerDesafio(d, 1_000_000 + 6 * 60_000)).toThrow();
    expect(() => s.lerDesafio(d.slice(0, -2) + 'xx', 1_000_000)).toThrow();
  });

  it('o mesmo codigo nao entra duas vezes; recuperacao vale uma vez so', async () => {
    const mestre = 'chave-mestra-de-teste-com-32-letras!!';
    const update = jest.fn(async () => ({}));
    const s = new DoisFatoresService({ user: { update } } as never, { jwt: { accessSecret: mestre } } as never);
    const segredo = base32(Buffer.from('segredo-de-teste-20b'));
    const agora = Date.now();
    const codigo = codigoTotp(deBase32(segredo), agora);
    const passo = passoDoTotp(deBase32(segredo), codigo, agora);
    expect(passo).toBe(Math.floor(agora / 30_000));
    const recuperacao = 'ABCD-EFGH';
    const resumoRec = createHash('sha256').update('ABCDEFGH').digest('hex');
    const meta = { doisFatores: { ativo: true, segredo: cifrar(segredo, mestre), recuperacao: [resumoRec], ultimoPasso: (passo as number) - 1 } };
    expect(await s.conferirEGastar('u1', meta, codigo)).toBe(true);
    const gravado = (update.mock.calls[0] as unknown as [{ data: { metadata: typeof meta } }])[0].data.metadata;
    expect(gravado.doisFatores.ultimoPasso).toBe(passo);
    expect(await s.conferirEGastar('u1', gravado, codigo)).toBe(false);
    expect(await s.conferirEGastar('u1', gravado, 'abcd efgh')).toBe(true);
    const semRec = (update.mock.calls[1] as unknown as [{ data: { metadata: typeof meta } }])[0].data.metadata;
    expect(semRec.doisFatores.recuperacao).toEqual([]);
    expect(await s.conferirEGastar('u1', semRec, 'ABCD-EFGH')).toBe(false);
    // Chave mestra trocada: o codigo do aplicativo nao abre (sem erro 500).
    const outra = new DoisFatoresService({ user: { update } } as never, { jwt: { accessSecret: 'outra-chave-mestra-de-teste-32-letras' } } as never);
    expect(await outra.conferirEGastar('u1', meta, codigoTotp(deBase32(segredo), Date.now()))).toBe(false);
  });
});
