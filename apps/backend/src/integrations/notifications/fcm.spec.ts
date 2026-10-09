import { generateKeyPairSync } from 'crypto';
import { chaveLimpa, enviarFcm } from './fcm';

describe('push (Firebase)', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const cred = { projectId: 'fortaleza-teste', clientEmail: 'push@fortaleza-teste.iam.gserviceaccount.com', privateKey: pem.replace(/\n/g, '\\n') };
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });

  it('a chave do Render com \\n escrito vira quebra de linha', () => {
    expect(chaveLimpa('-----BEGIN-----\\nabc\\n-----END-----')).toBe('-----BEGIN-----\nabc\n-----END-----');
  });

  it('assina o JWT, pede o acesso ao Google e manda com prioridade alta', async () => {
    const chamadas: Array<{ url: string; corpo: string }> = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: String(init?.body ?? '') });
      if (String(url).includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'acesso-google', expires_in: 3600 }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const r = await enviarFcm(cred, 'token-do-celular', { data: { tipo: 'chamado' }, validadeSegundos: 30 });
    expect(r.ok).toBe(true);
    const jwt = new URLSearchParams(chamadas[0].corpo).get('assertion')!;
    expect(jwt.split('.')).toHaveLength(3);
    const corpoJwt = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    expect(corpoJwt.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(chamadas[1].url).toBe('https://fcm.googleapis.com/v1/projects/fortaleza-teste/messages:send');
    const msg = JSON.parse(chamadas[1].corpo).message;
    expect(msg.token).toBe('token-do-celular');
    expect(msg.android).toEqual({ priority: 'HIGH', ttl: '30s' });
  });

  it('token que nao existe mais e marcado para apagar', async () => {
    global.fetch = jest.fn(async (url: string | URL | Request) =>
      String(url).includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }), { status: 200 })
        : new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 }),
    ) as typeof fetch;
    const r = await enviarFcm(cred, 'velho', { data: { tipo: 'corrida' } });
    expect(r).toMatchObject({ ok: false, invalido: true });
  });
});
