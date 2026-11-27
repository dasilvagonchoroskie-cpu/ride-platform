import { ERROR_CODES } from '@ride/shared';

/**
 * Recusas que interessam a seguranca (acesso negado, pedidos demais, entrada
 * errada) viram uma linha "[seguranca]" no registro do servidor. So vao o
 * numero da recusa, o endereco acessado (sem parametros), o IP e o numero
 * interno da conta: nunca a mensagem, o corpo, senha, codigo, e-mail ou
 * telefone. Repeticoes sao agrupadas e ha um teto por minuto, para o registro
 * nao crescer sem limite.
 */
const JANELA_MS = 60_000;
const LINHAS_POR_JANELA = 120;
const CHAVES_NA_MEMORIA = 2000;

/** Fazem parte do uso normal do aplicativo e da Central. */
const ESPERADAS = new Set<string>([
  ERROR_CODES.DRIVER_NOT_APPROVED,
  ERROR_CODES.SENHA_PROVISORIA,
  ERROR_CODES.REFAZER_DOIS_FATORES,
]);

const ENTRADA_ERRADA = new Set<string>([
  ERROR_CODES.INVALID_CREDENTIALS,
  ERROR_CODES.OTP_INVALID,
  ERROR_CODES.OTP_MAX_ATTEMPTS,
  ERROR_CODES.BOARDING_CODE_LOCKED,
]);

/** Endereco sem os parametros e sem codigos longos (links assinados). */
export function caminhoParaRegistro(url: string | undefined): string {
  return (url ?? '')
    .split('?')[0]
    .replace(/[^\x21-\x7e]/g, '')
    .split('/')
    .map((parte) => (parte.length > 40 ? ':longo' : parte))
    .join('/')
    .slice(0, 160);
}

export function interessaParaSeguranca(status: number, codigo: string, caminho: string): boolean {
  if (ENTRADA_ERRADA.has(codigo) || status === 429) return true;
  if (status === 403) return !ESPERADAS.has(codigo);
  return status === 401 && caminho.includes('/integracao/');
}

export interface Recusa {
  status: number;
  codigo: string;
  metodo: string;
  url: string | undefined;
  ip: string | undefined;
  conta: string | undefined;
}

const vistas = new Map<string, { desde: number; repetidas: number }>();
let janela = { desde: 0, linhas: 0, foraDaLista: 0 };

/** As linhas que devem ir para o registro agora (nenhuma, uma ou duas). */
export function linhasDeSeguranca(r: Recusa, agora = Date.now()): string[] {
  const caminho = caminhoParaRegistro(r.url);
  if (!interessaParaSeguranca(r.status, r.codigo, caminho)) return [];

  const saida: string[] = [];
  if (agora - janela.desde >= JANELA_MS) {
    if (janela.foraDaLista) saida.push(`[seguranca] recusas acima do teto por minuto, nao listadas=${janela.foraDaLista}`);
    janela = { desde: agora, linhas: 0, foraDaLista: 0 };
  }

  // Numeros internos mudam a cada tentativa: no agrupamento contam como um so.
  const rota = caminho.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/gi, ':n');
  const chave = `${r.status} ${r.codigo} ${r.metodo} ${rota} ${r.ip ?? '-'} ${r.conta ?? '-'}`;
  const vista = vistas.get(chave);
  if (vista && agora - vista.desde < JANELA_MS) {
    vista.repetidas += 1;
    return saida;
  }
  if (janela.linhas >= LINHAS_POR_JANELA) {
    janela.foraDaLista += 1;
    return saida;
  }
  if (vistas.size >= CHAVES_NA_MEMORIA) {
    for (const [k, v] of vistas) if (agora - v.desde >= JANELA_MS) vistas.delete(k);
    if (vistas.size >= CHAVES_NA_MEMORIA) vistas.clear();
  }
  vistas.set(chave, { desde: agora, repetidas: 0 });
  janela.linhas += 1;
  saida.push(
    `[seguranca] status=${r.status} codigo=${r.codigo} ${r.metodo} ${caminho} ip=${r.ip ?? '-'} user=${r.conta ?? '-'}` +
      (vista?.repetidas ? ` repetidas=${vista.repetidas}` : ''),
  );
  return saida;
}
