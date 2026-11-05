import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { z } from 'zod';

/**
 * Clube de Vantagens (Evandro, 05/11/2026). Regras puras: validacao do que a
 * Central manda e a carteirinha digital do motorista (QR Code).
 */

const texto = (max: number) => z.string().trim().max(max);
/** Telefone/WhatsApp: so numeros, com DDD (10 ou 11), opcional o 55. */
const telefone = z
  .string()
  .trim()
  .transform((t) => t.replace(/\D/g, ''))
  .refine((t) => t === '' || /^(55)?\d{10,11}$/.test(t), 'Telefone com DDD (10 ou 11 números).')
  .transform((t) => (t === '' ? null : t.length <= 11 ? `55${t}` : t));

export const parceiroSchema = z.object({
  nome: texto(120).min(2, 'Informe o nome comercial.'),
  categoria: texto(60).min(2, 'Escolha a categoria.'),
  descricao: texto(1000).default(''),
  endereco: texto(300).min(5, 'Informe o endereço completo.'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  telefone: telefone.nullable().optional(),
  whatsapp: telefone.nullable().optional(),
  horario: texto(300).default(''),
  vantagens: texto(1500).min(3, 'Descreva as vantagens para os motoristas.'),
  condicoes: texto(1500).default(''),
  ativo: z.boolean().default(true),
});
export type DadosDoParceiro = z.infer<typeof parceiroSchema>;

export const beneficioSchema = z.object({
  titulo: texto(120).min(2, 'Informe o benefício.'),
  descricao: texto(1000).default(''),
  condicoes: texto(1000).default(''),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(999).default(0),
});
export type DadosDoBeneficio = z.infer<typeof beneficioSchema>;

export const categoriasSchema = z.object({
  categorias: z.array(texto(60).min(2)).max(40),
});

export const logoSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dados: z.string().min(10).max(700_000),
});

/** Logotipo: ate 500 KB (o banco gratis tem 500 MB no total). */
export const MAX_LOGO_BYTES = 500 * 1024;

export const CHAVE_CATEGORIAS_CLUBE = 'clube.categorias';

/** Sugestoes iniciais de categoria (genericas; o dono edita na Central). */
export const CATEGORIAS_PADRAO = [
  'Alimentação',
  'Auto peças',
  'Oficina mecânica',
  'Posto de combustível',
  'Lava-jato',
  'Pneus e borracharia',
  'Farmácia',
  'Saúde',
  'Outros',
];

// ------------------------------------------------------------ carteirinha

/** O QR vale por 10 minutos (print antigo nao serve). */
export const VALIDADE_DO_QR_MS = 10 * 60 * 1000;

function chave(segredo: string): Buffer {
  return createHash('sha256').update(`clube-carteirinha:${segredo}`).digest();
}

const b64url = (b: Buffer) => b.toString('base64url');

/**
 * Codigo do QR: cifrado e assinado (AES-256-GCM) com um segredo do servidor.
 * Quem le o QR nao ve nada do motorista; ninguem fabrica um codigo valido.
 */
export function codigoDoQr(driverId: string, segredo: string, agora = Date.now()): { codigo: string; validoAte: Date } {
  const validoAte = new Date(agora + VALIDADE_DO_QR_MS);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(segredo), iv);
  const corpo = Buffer.concat([c.update(JSON.stringify({ d: driverId, e: validoAte.getTime() }), 'utf8'), c.final()]);
  return { codigo: `${b64url(iv)}.${b64url(corpo)}.${b64url(c.getAuthTag())}`, validoAte };
}

/** Le o codigo do QR. null = falso, alterado ou malformado; vencido diz que venceu. */
export function lerCodigoDoQr(
  codigo: string,
  segredo: string,
  agora = Date.now(),
): { driverId: string; validoAte: Date; vencido: boolean } | null {
  try {
    const [iv, corpo, tag] = codigo.split('.');
    if (!iv || !corpo || !tag) return null;
    // Base64 com bits sobrando trocados decodifica igual: so aceita a forma
    // exata que o servidor gerou (um codigo, um texto).
    if ([iv, corpo, tag].some((x) => b64url(Buffer.from(x, 'base64url')) !== x)) return null;
    const d = createDecipheriv('aes-256-gcm', chave(segredo), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    const json = JSON.parse(Buffer.concat([d.update(Buffer.from(corpo, 'base64url')), d.final()]).toString('utf8')) as { d?: unknown; e?: unknown };
    if (typeof json.d !== 'string' || typeof json.e !== 'number') return null;
    return { driverId: json.d, validoAte: new Date(json.e), vencido: json.e < agora };
  } catch {
    return null;
  }
}

/** Identificador do motorista na carteirinha: curto, sem expor o id do banco. */
export function codigoDoMotorista(driverId: string): string {
  return 'FM-' + createHash('sha256').update(`clube-id:${driverId}`).digest('hex').slice(0, 8).toUpperCase();
}

/** "Evandro Da Silva Gonchoroski" -> "Evandro G." (pagina publica do QR). */
export function nomeCurto(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'Motorista';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

/** Situacao do cadastro como aparece na carteirinha. */
export function situacaoDoMotorista(status: string, bloqueado: boolean): { codigo: 'ATIVO' | 'PENDENTE' | 'SUSPENSO'; texto: string } {
  if (bloqueado || status === 'SUSPENDED' || status === 'BLOCKED' || status === 'REJECTED') return { codigo: 'SUSPENSO', texto: 'Cadastro suspenso' };
  if (status === 'APPROVED') return { codigo: 'ATIVO', texto: 'Motorista parceiro ativo' };
  return { codigo: 'PENDENTE', texto: 'Cadastro em análise' };
}
