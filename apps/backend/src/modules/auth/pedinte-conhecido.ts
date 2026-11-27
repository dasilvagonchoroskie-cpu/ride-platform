import { PrismaService } from '../../database/prisma.service';
import { origemDoPedido } from './origem-do-pedido';
import { Pedinte } from './limite-de-senha';

/**
 * So vale o codigo de instalacao sorteado pelo aplicativo (128 bits). Nomes
 * fixos, usados por versoes antigas, nao servem para reconhecer ninguem.
 */
const CODIGO_DE_INSTALACAO = /^(and|and-com|web)-[0-9a-f]{32}$/;
const DIAS_DE_MEMORIA_DA_CONEXAO = 90;

/**
 * Quem esta pedindo: um aparelho ou conexao que ja entrou NESTA conta, ou um
 * desconhecido. Ser conhecido nao dispensa senha, codigo nem o limite por
 * pedinte: apenas evita dividir o teto com quem e de fora.
 */
export async function reconhecerPedinte(
  prisma: PrismaService,
  userId: string | undefined | null,
  dados: { instalacao?: string; origem?: string },
): Promise<Pedinte> {
  const { instalacao, origem } = dados;
  if (userId && instalacao && CODIGO_DE_INSTALACAO.test(instalacao)) {
    const aparelho = await prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: instalacao } },
      select: { id: true },
    });
    if (aparelho) return { chave: `aparelho:${instalacao}`, conhecido: true };
  }

  const chave = `origem:${origem ?? 'sem-origem'}`;
  if (!userId || !origem) return { chave, conhecido: false };
  const desde = new Date(Date.now() - DIAS_DE_MEMORIA_DA_CONEXAO * 24 * 60 * 60 * 1000);
  const entradas = await prisma.refreshToken.findMany({
    where: { userId, ip: { not: null }, createdAt: { gte: desde } },
    select: { ip: true },
    distinct: ['ip'],
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return { chave, conhecido: entradas.some((e) => origemDoPedido(e.ip ?? undefined) === origem) };
}
