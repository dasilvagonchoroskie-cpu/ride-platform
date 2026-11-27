/**
 * De onde veio um pedido de codigo de acesso. Os limites sao contados por
 * pessoa que pede, e nao so pela conta, para o uso de uma pessoa nao gastar
 * a cota da outra.
 *
 * No IPv6 o celular troca o final do endereco o tempo todo, e uma unica
 * conexao tem milhoes de finais: vale o comeco (os 4 primeiros grupos).
 */
export function origemDoPedido(ip?: string): string | undefined {
  const limpo = (ip ?? '').trim().toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  if (!limpo) return undefined;
  if (!limpo.includes(':')) return limpo.slice(0, 60);
  const [antes, depois] = limpo.split('%')[0].split('::');
  const inicio = antes ? antes.split(':') : [];
  const fim = depois ? depois.split(':') : [];
  const zeros = depois === undefined ? 0 : Math.max(0, 8 - inicio.length - fim.length);
  const grupos = [...inicio, ...Array<string>(zeros).fill('0'), ...fim];
  return `${grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
