/**
 * Senhas erradas. Fica na memoria porque a API roda em uma unica instancia.
 *
 * Cada pedinte (aparelho ou conexao) tem a sua contagem em cada conta. Quem a
 * conta ainda nao conhece tambem divide um teto por conta, para a soma de
 * muitas conexoes continuar limitada. Aparelho ou conexao que ja entrou na
 * conta nao depende desse teto (ver pedinte-conhecido.ts).
 */
export const ERROS_PERMITIDOS = 8;
export const ERROS_DE_DESCONHECIDOS = 24;
export const ERROS_DE_DESCONHECIDOS_NO_DIA = 100;
export const ESPERA_MS = 15 * 60_000;
const DIA_MS = 24 * 60 * 60_000;

export interface Pedinte {
  chave: string;
  conhecido: boolean;
}

interface Contagem {
  tentativas: number;
  desde: number;
}

interface Conta {
  pedintes: Map<string, Contagem>;
  desconhecidos: Contagem;
  noDia: Contagem;
}

const contas = new Map<string, Conta>();

const nova = (agora: number): Contagem => ({ tentativas: 0, desde: agora });
const emDia = (c: Contagem, prazo: number, agora: number): Contagem => (agora - c.desde >= prazo ? nova(agora) : c);

function somar(c: Contagem, maximo: number, agora: number): void {
  c.tentativas += 1;
  // Ao chegar no limite, a espera passa a contar a partir desta tentativa.
  if (c.tentativas === maximo) c.desde = agora;
}

/** Tira da memoria o que ja venceu. */
function limpar(agora: number): void {
  for (const [chave, conta] of contas) {
    for (const [k, v] of conta.pedintes) if (agora - v.desde >= ESPERA_MS) conta.pedintes.delete(k);
    const semTeto = agora - conta.desconhecidos.desde >= ESPERA_MS && agora - conta.noDia.desde >= DIA_MS;
    if (!conta.pedintes.size && (semTeto || !conta.noDia.tentativas)) contas.delete(chave);
  }
}

/** Chamar antes de comparar a senha. Devolve false quando este pedinte precisa esperar. */
export function reservarTentativa(chaveDaConta: string, pedinte: Pedinte, agora = Date.now()): boolean {
  if (contas.size >= 5000 && !contas.has(chaveDaConta)) limpar(agora);
  const conta = contas.get(chaveDaConta) ?? { pedintes: new Map(), desconhecidos: nova(agora), noDia: nova(agora) };

  const meu = emDia(conta.pedintes.get(pedinte.chave) ?? nova(agora), ESPERA_MS, agora);
  if (meu.tentativas >= ERROS_PERMITIDOS) return false;

  if (!pedinte.conhecido) {
    conta.desconhecidos = emDia(conta.desconhecidos, ESPERA_MS, agora);
    conta.noDia = emDia(conta.noDia, DIA_MS, agora);
    if (conta.desconhecidos.tentativas >= ERROS_DE_DESCONHECIDOS) return false;
    if (conta.noDia.tentativas >= ERROS_DE_DESCONHECIDOS_NO_DIA) return false;
    somar(conta.desconhecidos, ERROS_DE_DESCONHECIDOS, agora);
    somar(conta.noDia, ERROS_DE_DESCONHECIDOS_NO_DIA, agora);
  }

  somar(meu, ERROS_PERMITIDOS, agora);
  conta.pedintes.set(pedinte.chave, meu);
  contas.set(chaveDaConta, conta);
  return true;
}

/** Senha certa: zera a contagem de quem acertou (a das outras pessoas continua). */
export function senhaCerta(chaveDaConta: string, pedinte: Pedinte): void {
  const conta = contas.get(chaveDaConta);
  if (!conta) return;
  conta.pedintes.delete(pedinte.chave);
  // A tentativa certa nao e um erro: sai do teto de quem ainda nao era conhecido.
  if (!pedinte.conhecido) {
    for (const c of [conta.desconhecidos, conta.noDia]) c.tentativas = Math.max(0, c.tentativas - 1);
  }
}

/** Senha nova criada com o codigo do e-mail: a conta comeca do zero. */
export function liberarConta(chaveDaConta: string): void {
  contas.delete(chaveDaConta);
}
