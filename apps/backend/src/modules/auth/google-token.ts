import { createPublicKey, KeyObject, verify } from 'crypto';
import { emailSchema } from '@ride/shared';

/**
 * "Entrar com Google": conferencia do comprovante (ID token) NO SERVIDOR.
 * Nada que o aplicativo diga e aceito sem a assinatura do Google.
 * Regras: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */
export const URL_CHAVES_GOOGLE = 'https://www.googleapis.com/oauth2/v3/certs';
export const FORMATO_ID_DO_CLIENTE = /^\d+-[a-z0-9_]+\.apps\.googleusercontent\.com$/;

const EMISSORES = ['accounts.google.com', 'https://accounts.google.com'];
const FOLGA_DO_RELOGIO_S = 60;
const TAMANHO_MAXIMO = 4096;
/** Entre uma busca de chaves e outra (um token inventado nao forca buscas). */
const ESPERA_ENTRE_BUSCAS_MS = 60_000;
/** Sem conseguir renovar, as chaves guardadas ainda valem por este tempo. */
const CHAVES_VELHAS_NO_MAXIMO_MS = 24 * 3600_000;

export class TokenGoogleRecusado extends Error {}
export class GoogleForaDoAr extends Error {}

export interface ContaGoogle {
  /** Codigo fixo da conta Google (o e-mail pode mudar; este nao). */
  sub: string;
  email: string;
  nome: string | null;
  /**
   * O Google e a "autoridade" sobre o endereco (Gmail ou conta de empresa no
   * Google). Fora disso, pedimos tambem o codigo enviado ao e-mail.
   */
  autoritativo: boolean;
}

export class ChavesDoGoogle {
  private chaves = new Map<string, KeyObject>();
  private valeAte = 0;
  private ultimaBusca = Number.NEGATIVE_INFINITY;
  private buscando: Promise<void> | null = null;

  constructor(
    private readonly baixar: typeof fetch = (url, opcoes) => fetch(url, opcoes),
    private readonly agora: () => number = () => Date.now(),
  ) {}

  async chave(kid: string): Promise<KeyObject | null> {
    const t = this.agora();
    if (t >= this.valeAte + CHAVES_VELHAS_NO_MAXIMO_MS) this.chaves.clear();
    if (t >= this.valeAte || !this.chaves.has(kid)) {
      if (!this.buscando && t - this.ultimaBusca >= ESPERA_ENTRE_BUSCAS_MS) {
        this.ultimaBusca = t;
        this.buscando = this.atualizar().finally(() => (this.buscando = null));
      }
      if (this.buscando) await this.buscando;
    }
    if (this.chaves.size === 0) throw new GoogleForaDoAr('Sem as chaves publicas do Google.');
    return this.chaves.get(kid) ?? null;
  }

  private async atualizar(): Promise<void> {
    try {
      const r = await this.baixar(URL_CHAVES_GOOGLE, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!r.ok) return;
      const corpo = (await r.json()) as { keys?: Array<Record<string, string>> };
      const novas = new Map<string, KeyObject>();
      for (const k of corpo.keys ?? []) {
        if (k.kty !== 'RSA' || !k.kid || !k.n || !k.e || (k.use && k.use !== 'sig')) continue;
        novas.set(k.kid, createPublicKey({ key: { kty: 'RSA', n: k.n, e: k.e }, format: 'jwk' }));
      }
      if (novas.size === 0) return;
      const idade = /max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1];
      const segundos = Math.min(Math.max(Number(idade ?? 3600), 300), 86_400);
      this.chaves = novas;
      this.valeAte = this.agora() + segundos * 1000;
    } catch {
      // Sem rede: segue com as chaves guardadas (se houver).
    }
  }
}

function parte(texto: string): Record<string, unknown> {
  try {
    const v = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8')) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw new TokenGoogleRecusado('formato');
}

/** Confere assinatura, emissor, destinatario, validade e e-mail. */
export async function lerContaGoogle(
  idToken: string,
  idDoCliente: string,
  chaves: Pick<ChavesDoGoogle, 'chave'>,
  agora = Date.now(),
): Promise<ContaGoogle> {
  if (!idDoCliente || idToken.length > TAMANHO_MAXIMO) throw new TokenGoogleRecusado('formato');
  const pedacos = idToken.split('.');
  if (pedacos.length !== 3 || !pedacos.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) throw new TokenGoogleRecusado('formato');
  const [cabecalho, dados, assinatura] = pedacos;

  const h = parte(cabecalho);
  // So RS256: o algoritmo nunca e escolhido por quem mandou o token.
  if (h.alg !== 'RS256' || typeof h.kid !== 'string' || !h.kid) throw new TokenGoogleRecusado('algoritmo');
  const chave = await chaves.chave(h.kid);
  if (!chave) throw new TokenGoogleRecusado('chave desconhecida');
  if (!verify('RSA-SHA256', Buffer.from(`${cabecalho}.${dados}`), chave, Buffer.from(assinatura, 'base64url'))) {
    throw new TokenGoogleRecusado('assinatura');
  }

  const c = parte(dados);
  const segundos = Math.floor(agora / 1000);
  if (typeof c.iss !== 'string' || !EMISSORES.includes(c.iss)) throw new TokenGoogleRecusado('emissor');
  // Comprovante feito para OUTRO aplicativo nao vale aqui.
  if (c.aud !== idDoCliente) throw new TokenGoogleRecusado('destinatario');
  if (typeof c.exp !== 'number' || c.exp + FOLGA_DO_RELOGIO_S <= segundos) throw new TokenGoogleRecusado('vencido');
  if (typeof c.iat !== 'number' || c.iat - FOLGA_DO_RELOGIO_S > segundos) throw new TokenGoogleRecusado('data');
  if (typeof c.nbf === 'number' && c.nbf - FOLGA_DO_RELOGIO_S > segundos) throw new TokenGoogleRecusado('data');
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) throw new TokenGoogleRecusado('conta');
  if (c.email_verified !== true && c.email_verified !== 'true') throw new TokenGoogleRecusado('e-mail nao confirmado');
  const email = emailSchema.safeParse(c.email);
  if (!email.success) throw new TokenGoogleRecusado('e-mail');

  const nome = typeof c.name === 'string' ? c.name.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  return {
    sub: c.sub,
    email: email.data,
    nome: nome || null,
    autoritativo: email.data.endsWith('@gmail.com') || (typeof c.hd === 'string' && c.hd.length > 0),
  };
}

/** Ligacao guardada na conta (`users.metadata.google`). */
export interface LigacaoGoogle {
  sub: string;
  email: string;
  ligadoEm: string;
}

/**
 * A ligacao so vale enquanto o e-mail da conta for o mesmo de quando foi
 * feita: trocou o e-mail (por qualquer caminho), o Google antigo deixa de
 * entrar. Conta excluida perde a ligacao junto com os outros dados.
 */
export function ligacaoGoogle(user: { email?: string | null; metadata?: unknown }): LigacaoGoogle | null {
  const g = (user.metadata as { google?: Partial<LigacaoGoogle> } | null | undefined)?.google;
  if (!g || typeof g.sub !== 'string' || typeof g.email !== 'string' || !user.email) return null;
  if (g.email.toLowerCase() !== user.email.toLowerCase()) return null;
  return { sub: g.sub, email: g.email, ligadoEm: typeof g.ligadoEm === 'string' ? g.ligadoEm : '' };
}
