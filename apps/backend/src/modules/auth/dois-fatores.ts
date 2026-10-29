import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ERROR_CODES, UserRole } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { BusinessException } from '../../common/errors/business.exception';

/**
 * Verificacao em duas etapas da Central (etapa 7, Evandro 29/10/2026:
 * "Google Authenticator"). Codigo de 6 numeros que muda a cada 30 s (TOTP,
 * RFC 6238), igual ao Google Authenticator, Authy e Microsoft Authenticator.
 *
 * - Fica em users.metadata.doisFatores (sem mudar o banco). O segredo vai
 *   CIFRADO (AES-256-GCM, chave tirada do JWT_ACCESS_SECRET do Render).
 * - 8 codigos de recuperacao (uso unico), guardados so o resumo (SHA-256).
 * - Login da Central (senha ou codigo do e-mail) com as duas etapas ligadas:
 *   o servidor devolve um "desafio" de 5 minutos; os tokens so saem com o
 *   codigo do aplicativo autenticador (ou um de recuperacao).
 * - A esteira de testes (chave do teste, segredo do GitHub) passa direto.
 */

// ------------------------------------------------------------------
// TOTP puro (testado com os vetores da RFC 6238)
// ------------------------------------------------------------------

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const b of buf) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const saida: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(saida);
}

/** Codigo TOTP de [digitos] numeros para o instante [ms]. */
export function codigoTotp(segredo: Buffer, ms: number, digitos = 6, passo = 30, algoritmo = 'sha1'): string {
  const contador = Math.floor(ms / 1000 / passo);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = createHmac(algoritmo, segredo).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digitos).padStart(digitos, '0');
}

/**
 * Passo de 30 s em que o codigo vale, aceitando 30 s antes e depois (relogio
 * do celular adiantado/atrasado). null = codigo errado.
 */
export function passoDoTotp(segredo: Buffer, codigo: string, ms = Date.now()): number | null {
  const c = codigo.replace(/\D/g, '');
  if (c.length !== 6) return null;
  const agora = Math.floor(ms / 30_000);
  for (const d of [-1, 0, 1]) {
    const esperado = codigoTotp(segredo, (agora + d) * 30_000);
    if (timingSafeEqual(Buffer.from(esperado), Buffer.from(c))) return agora + d;
  }
  return null;
}

/** Confere o codigo aceitando 30 s antes e depois. */
export function conferirTotp(segredo: Buffer, codigo: string, ms = Date.now()): boolean {
  return passoDoTotp(segredo, codigo, ms) !== null;
}

/** Link que o Google Authenticator abre (otpauth://). */
export function linkDoAutenticador(segredoB32: string, conta: string, emissor = 'Fortaleza Move'): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredoB32}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
}

// ------------------------------------------------------------------
// Cifra do segredo guardado
// ------------------------------------------------------------------

function chaveDe(mestre: string): Buffer {
  return createHash('sha256').update(`${mestre}:dois-fatores:v1`).digest();
}

export function cifrar(texto: string, mestre: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chaveDe(mestre), iv);
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), corpo.toString('base64')].join('.');
}

export function decifrar(guardado: string, mestre: string): string {
  const [v, iv, tag, corpo] = guardado.split('.');
  if (v !== 'v1' || !iv || !tag || !corpo) throw new Error('formato');
  const d = createDecipheriv('aes-256-gcm', chaveDe(mestre), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(corpo, 'base64')), d.final()]).toString('utf8');
}

const resumo = (t: string) => createHash('sha256').update(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).digest('hex');

interface DadosDoisFatores {
  ativo?: boolean;
  segredo?: string;
  ativadoEm?: string;
  recuperacao?: string[];
  /** Ultimo passo de 30 s usado: o mesmo codigo nao entra duas vezes. */
  ultimoPasso?: number;
  pendente?: { segredo: string; criadoEm: string };
}

type Meta = Record<string, unknown> & { doisFatores?: DadosDoisFatores };

const metaDe = (v: unknown): Meta => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Meta) : {});

export function doisFatoresLigado(metadata: unknown): boolean {
  return metaDe(metadata).doisFatores?.ativo === true;
}

@Injectable()
export class DoisFatoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private get mestre(): string {
    return this.config.jwt.accessSecret;
  }

  private async conta(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true, phone: true, metadata: true } });
    if (!u) throw BusinessException.notFound('Conta nao encontrada.');
    if (u.role !== UserRole.ADMIN) throw BusinessException.forbidden('So a Central usa a verificacao em duas etapas.');
    return u;
  }

  private async gravar(userId: string, meta: Meta, dados: DadosDoisFatores | undefined) {
    const novo = { ...meta };
    if (dados) novo.doisFatores = dados;
    else delete novo.doisFatores;
    await this.prisma.user.update({ where: { id: userId }, data: { metadata: novo as never } });
  }

  async situacao(userId: string) {
    const u = await this.conta(userId);
    const d = metaDe(u.metadata).doisFatores;
    return { ativo: d?.ativo === true, ativadoEm: d?.ativadoEm ?? null, recuperacaoRestantes: d?.recuperacao?.length ?? 0 };
  }

  /** Passo 1: segredo novo (ainda nao vale ate confirmar com um codigo). */
  async iniciar(userId: string) {
    const u = await this.conta(userId);
    const meta = metaDe(u.metadata);
    if (meta.doisFatores?.ativo) throw BusinessException.conflict('A verificacao em duas etapas ja esta ligada.');
    const segredo = base32(randomBytes(20));
    await this.gravar(userId, meta, { ...(meta.doisFatores ?? {}), pendente: { segredo: cifrar(segredo, this.mestre), criadoEm: new Date().toISOString() } });
    const conta = u.email ?? u.phone;
    return { segredo: segredo.replace(/(.{4})/g, '$1 ').trim(), link: linkDoAutenticador(segredo, conta) };
  }

  /** Passo 2: o primeiro codigo do aplicativo liga a verificacao. Devolve os codigos de recuperacao (uma vez so). */
  async ativar(userId: string, codigo: string) {
    const u = await this.conta(userId);
    const meta = metaDe(u.metadata);
    const p = meta.doisFatores?.pendente;
    if (!p) throw BusinessException.validation('Comece de novo em "Ligar verificacao em duas etapas".');
    if (Date.now() - new Date(p.criadoEm).getTime() > 30 * 60_000) throw BusinessException.validation('Passou o tempo. Comece de novo.');
    const segredo = decifrar(p.segredo, this.mestre);
    const passo = passoDoTotp(deBase32(segredo), codigo);
    if (passo === null) {
      throw BusinessException.validation('Codigo errado. Confira se o relogio do celular esta certo e digite o codigo que aparece agora.');
    }
    const recuperacao = Array.from({ length: 8 }, () => {
      const t = base32(randomBytes(5)).slice(0, 8);
      return `${t.slice(0, 4)}-${t.slice(4)}`;
    });
    await this.gravar(userId, meta, {
      ativo: true,
      segredo: cifrar(segredo, this.mestre),
      ativadoEm: new Date().toISOString(),
      recuperacao: recuperacao.map(resumo),
      ultimoPasso: passo,
    });
    return { ativo: true, recuperacao };
  }

  /** Desligar pede um codigo valido (do aplicativo ou de recuperacao). */
  async desligar(userId: string, codigo: string) {
    const u = await this.conta(userId);
    const meta = metaDe(u.metadata);
    if (!meta.doisFatores?.ativo) return { ativo: false };
    if (!(await this.conferirEGastar(userId, meta, codigo))) throw BusinessException.validation('Codigo errado.');
    await this.gravar(userId, metaDe((await this.conta(userId)).metadata), undefined);
    return { ativo: false };
  }

  /** Confere o codigo do aplicativo ou gasta um de recuperacao. */
  async conferirEGastar(userId: string, meta: Meta, codigo: string): Promise<boolean> {
    const d = meta.doisFatores;
    if (!d?.ativo || !d.segredo) return false;
    if (/^\d{6}$/.test(codigo.replace(/\s/g, ''))) {
      let passo: number | null;
      try {
        passo = passoDoTotp(deBase32(decifrar(d.segredo, this.mestre)), codigo);
      } catch {
        // Segredo que nao abre (JWT_ACCESS_SECRET trocado): so os codigos de
        // recuperacao entram (ver docs/CONTAS.md).
        return false;
      }
      // Mesmo codigo de novo (alguem viu por cima do ombro): recusa.
      if (passo === null || (d.ultimoPasso != null && passo <= d.ultimoPasso)) return false;
      await this.gravar(userId, meta, { ...d, ultimoPasso: passo });
      return true;
    }
    const r = resumo(codigo);
    const lista = d.recuperacao ?? [];
    if (!lista.includes(r)) return false;
    await this.gravar(userId, meta, { ...d, recuperacao: lista.filter((x) => x !== r) });
    return true;
  }

  // ------------------------------------------------------------------
  // Desafio do login (5 minutos, assinado; nao guarda nada)
  // ------------------------------------------------------------------

  criarDesafio(userId: string, agora = Date.now()): string {
    const corpo = Buffer.from(JSON.stringify({ u: userId, e: agora + 5 * 60_000 })).toString('base64url');
    const assinatura = createHmac('sha256', chaveDe(this.mestre)).update(corpo).digest('base64url');
    return `${corpo}.${assinatura}`;
  }

  lerDesafio(desafio: string, agora = Date.now()): string {
    const [corpo, assinatura] = desafio.split('.');
    const certa = corpo ? createHmac('sha256', chaveDe(this.mestre)).update(corpo).digest('base64url') : '';
    if (!corpo || !assinatura || assinatura.length !== certa.length || !timingSafeEqual(Buffer.from(assinatura), Buffer.from(certa))) {
      throw BusinessException.unauthorized('Login expirado. Entre de novo.', ERROR_CODES.INVALID_CREDENTIALS);
    }
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as { u: string; e: number };
    if (!d.u || agora > d.e) throw BusinessException.unauthorized('Passou o tempo. Entre de novo.', ERROR_CODES.INVALID_CREDENTIALS);
    return d.u;
  }
}
