import type { PrismaClient } from '@prisma/client';

/**
 * Quando uma conta e apagada (Central -> Excluir passageiro, Limpeza de dados,
 * "desfazer conta nova"), o cadastro do estabelecimento ligado a ela nao pode
 * travar a exclusao (a chave estrangeira impede apagar a conta) nem ficar
 * guardando dados pessoais de quem saiu.
 *
 *  - sem entregas pedidas (ou `apagarTudo`, usado na limpeza do teste, que ja
 *    apaga as corridas): o cadastro sai de vez;
 *  - com entregas: fica o historico financeiro, mas SUSPENSO e sem dados
 *    pessoais (nome, CNPJ, CPF, telefone, e-mail e endereco).
 *
 * Roda ANTES da transacao da exclusao e nunca derruba a exclusao: se algo
 * falhar (ex.: tabela ainda nao criada), registra e segue como antes.
 */
export async function encerrarComercios(
  prisma: Pick<PrismaClient, 'comercio' | 'comercioPedido'>,
  userIds: string[],
  opcoes: { apagarTudo?: boolean } = {},
  aviso: (m: string) => void = () => undefined,
): Promise<{ apagados: number; anonimizados: number }> {
  const r = { apagados: 0, anonimizados: 0 };
  if (userIds.length === 0) return r;
  try {
    const lojas = await prisma.comercio.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    for (const { id } of lojas) {
      const temEntregas = opcoes.apagarTudo ? false : (await prisma.comercioPedido.count({ where: { comercioId: id } })) > 0;
      if (!temEntregas) {
        await prisma.comercioPedido.deleteMany({ where: { comercioId: id } });
        await prisma.comercio.delete({ where: { id } });
        r.apagados++;
      } else {
        const marca = id.replace(/-/g, '').slice(0, 10);
        await prisma.comercio.update({
          where: { id },
          data: {
            nomeFantasia: 'Estabelecimento excluído',
            razaoSocial: null,
            cnpj: `excl${marca}`,
            responsavelNome: 'Excluído',
            responsavelCpf: null,
            telefone: `excl-${marca}`,
            email: `excl-${marca}@excluido.invalid`,
            logradouro: '-',
            numero: '-',
            complemento: null,
            bairro: '-',
            latitude: null,
            longitude: null,
            status: 'SUSPENSO',
            motivo: 'Conta excluída.',
          },
        });
        r.anonimizados++;
      }
    }
  } catch (e) {
    aviso(`Comercio: nao encerrou o cadastro da loja ao apagar a conta (${(e as Error).message})`);
  }
  return r;
}
