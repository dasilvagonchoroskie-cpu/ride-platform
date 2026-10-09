import { createSign } from 'crypto';

/**
 * Firebase Cloud Messaging (API v1), sem biblioteca a mais: assina o JWT
 * da conta de servico com a chave privada, troca por um acesso do Google
 * (vale 1 h, guardado) e manda a mensagem.
 */
export interface CredencialFcm {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let acesso: { token: string; ate: number; email: string } | null = null;

const base64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Chave vinda do Render costuma ter "\n" escrito: vira quebra de linha de verdade. */
export function chaveLimpa(k: string): string {
  return k.includes('\\n') ? k.replace(/\\n/g, '\n') : k;
}

async function tokenDoGoogle(c: CredencialFcm): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  if (acesso && acesso.email === c.clientEmail && acesso.ate > agora + 60) return acesso.token;
  const cabeca = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(
    JSON.stringify({
      iss: c.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    }),
  );
  const assinador = createSign('RSA-SHA256');
  assinador.update(`${cabeca}.${corpo}`);
  const assinatura = base64url(assinador.sign(chaveLimpa(c.privateKey)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabeca}.${corpo}.${assinatura}`,
    }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google recusou a credencial do Firebase (${j.error ?? r.status}).`);
  acesso = { token: j.access_token, ate: agora + (j.expires_in ?? 3600), email: c.clientEmail };
  return j.access_token;
}

export interface MensagemFcm {
  /** Tudo vira texto (exigencia do FCM). */
  data: Record<string, string>;
  /** Segundos que a mensagem vale se o celular estiver fora (padrao 60). */
  validadeSegundos?: number;
}

/** Envia para um aparelho. invalido = token que nao existe mais (apagar). */
export async function enviarFcm(c: CredencialFcm, token: string, m: MensagemFcm): Promise<{ ok: boolean; invalido: boolean; erro?: string }> {
  const acessoGoogle = await tokenDoGoogle(c);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${c.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acessoGoogle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data: m.data,
        // Alta prioridade: acorda o celular com a tela apagada (chamado de
        // corrida nao pode esperar o modo economia do Android).
        android: { priority: 'HIGH', ttl: `${m.validadeSegundos ?? 60}s` },
      },
    }),
  });
  if (r.ok) return { ok: true, invalido: false };
  const texto = await r.text().catch(() => '');
  // 404/UNREGISTERED: o app foi desinstalado. 400 com "registration token":
  // o endereco nunca existiu (ou veio cortado). Os dois saem do banco.
  const invalido = r.status === 404 || /UNREGISTERED/.test(texto) || (r.status === 400 && /registration token/i.test(texto));
  return { ok: false, invalido, erro: `${r.status} ${texto.slice(0, 200)}` };
}
