/** Quantos codigos de acesso podem ser pedidos. */
export const LIMITE_DE_CODIGOS = {
  /** Mesma pessoa pedindo para o mesmo telefone ou e-mail, por hora. */
  porPessoaEContaNaHora: 6,
  /** Teto do telefone ou e-mail, somando todo mundo (protege a caixa de entrada). */
  porContaNaHora: 15,
  porContaNoDia: 40,
  /** Quem ja entrou na conta nao usa o teto acima; tem o proprio limite diario. */
  porConhecidoNoDia: 20,
  /** Mesma origem pedindo para contas diferentes (operadoras de celular dividem enderecos). */
  porPessoaNaHora: 40,
} as const;

/**
 * Erros de quem NAO pediu o codigo (ou mudou de rede depois de pedir). Tem
 * conta separada: nao gastam as tentativas de quem pediu. Fica na memoria
 * (a API roda em uma instancia so e o codigo vale poucos minutos).
 */
const deFora = new Map<string, { usadas: number; vence: number }>();

export function reservarTentativaDeFora(codigoId: string, maximo: number, vence: Date, agora = Date.now()): boolean {
  if (deFora.size >= 5000) {
    for (const [k, v] of deFora) if (v.vence < agora) deFora.delete(k);
  }
  const atual = deFora.get(codigoId) ?? { usadas: 0, vence: vence.getTime() };
  if (atual.usadas >= maximo) return false;
  atual.usadas += 1;
  deFora.set(codigoId, atual);
  return true;
}

const filas = new Map<string, Promise<unknown>>();

/**
 * Roda uma tarefa de cada vez para a mesma chave. Conferir o limite e gravar
 * o pedido sao dois passos: sem a fila, pedidos simultaneos veriam a mesma
 * contagem. Vale para uma instancia da API, como hoje.
 */
export async function umDeCadaVez<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior: Promise<unknown> = filas.get(chave) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(tarefa);
  filas.set(chave, atual);
  try {
    return await atual;
  } finally {
    if (filas.get(chave) === atual) filas.delete(chave);
  }
}
