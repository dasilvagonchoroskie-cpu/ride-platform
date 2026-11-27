/**
 * Senhas erradas por conta. Fica na memoria porque a API roda em uma unica
 * instancia. Vale para qualquer endereco de origem. Quem for barrado aqui
 * continua podendo entrar pelo codigo enviado por e-mail.
 */
export const ERROS_PERMITIDOS = 8;
export const ESPERA_MS = 15 * 60_000;

const contas = new Map<string, { tentativas: number; desde: number }>();

/** Chamar antes de comparar a senha. Devolve false quando a conta precisa esperar. */
export function reservarTentativa(chave: string, agora = Date.now()): boolean {
  let c = contas.get(chave);
  if (!c || agora - c.desde >= ESPERA_MS) {
    if (contas.size >= 5000) {
      for (const [k, v] of contas) if (agora - v.desde >= ESPERA_MS) contas.delete(k);
    }
    c = { tentativas: 0, desde: agora };
    contas.set(chave, c);
  }
  if (c.tentativas >= ERROS_PERMITIDOS) return false;
  c.tentativas += 1;
  // A espera passa a contar a partir da ultima tentativa permitida.
  if (c.tentativas === ERROS_PERMITIDOS) c.desde = agora;
  return true;
}

/** Senha certa (ou senha nova criada): a contagem volta a zero. */
export function liberarConta(chave: string): void {
  contas.delete(chave);
}
