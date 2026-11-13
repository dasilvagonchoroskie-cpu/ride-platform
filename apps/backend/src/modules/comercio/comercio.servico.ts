import { PrismaService } from '../../database/prisma.service';

/**
 * Tipo de servico de cada corrida, vindo do BANCO (nunca do texto da descricao):
 * - COMERCIO: existe um pedido do Comercio ligado a corrida (`comercio_pedidos`);
 * - ENTREGA: entrega pedida pelo aplicativo do passageiro (`entregas` sem pedido do Comercio);
 * - PASSAGEIRO: corrida de passageiro.
 * Para o mapa e as listas da Central (12/11/2026).
 */
export type TipoDeServico = 'PASSAGEIRO' | 'ENTREGA' | 'COMERCIO';

export interface ServicoDaCorrida {
  servico: TipoDeServico;
  /** So no Comercio: APP (a loja pediu), MOTORISTA ou CENTRAL (lancamento manual). */
  origem: 'APP' | 'MOTORISTA' | 'CENTRAL' | null;
  comercioId: string | null;
  comercio: string | null;
}

export const SEM_SERVICO: ServicoDaCorrida = { servico: 'PASSAGEIRO', origem: null, comercioId: null, comercio: null };

/** Uma consulta para o lote de corridas (duas tabelas pequenas, por chave primaria). */
export async function servicosDasCorridas(prisma: PrismaService, rideIds: string[]): Promise<Map<string, ServicoDaCorrida>> {
  const mapa = new Map<string, ServicoDaCorrida>();
  const ids = [...new Set(rideIds)].filter(Boolean);
  if (ids.length === 0) return mapa;
  const [pedidos, entregas] = await Promise.all([
    prisma.comercioPedido.findMany({
      where: { rideId: { in: ids } },
      select: { rideId: true, origem: true, comercioId: true, comercio: { select: { nomeFantasia: true } } },
    }),
    prisma.entrega.findMany({ where: { rideId: { in: ids } }, select: { rideId: true } }),
  ]);
  for (const e of entregas) mapa.set(e.rideId, { servico: 'ENTREGA', origem: null, comercioId: null, comercio: null });
  for (const p of pedidos) {
    mapa.set(p.rideId, {
      servico: 'COMERCIO',
      origem: p.origem === 'MOTORISTA' ? 'MOTORISTA' : p.origem === 'CENTRAL' ? 'CENTRAL' : 'APP',
      comercioId: p.comercioId,
      comercio: p.comercio.nomeFantasia,
    });
  }
  return mapa;
}

export const servicoDa = (mapa: Map<string, ServicoDaCorrida>, rideId: string | null | undefined): ServicoDaCorrida =>
  (rideId ? mapa.get(rideId) : undefined) ?? SEM_SERVICO;

/**
 * Motoristas com um SOS aberto (botao de panico ainda nao resolvido): o do
 * proprio motorista ou o do passageiro/loja na corrida dele.
 */
export async function motoristasEmSos(prisma: PrismaService): Promise<Set<string>> {
  const abertos = await prisma.safetyEvent.findMany({
    where: { type: 'PANIC_BUTTON', resolved: false },
    select: { userId: true, ride: { select: { driverId: true } }, user: { select: { driver: { select: { id: true } } } } },
    take: 200,
  });
  const ids = new Set<string>();
  for (const e of abertos) {
    if (e.ride?.driverId) ids.add(e.ride.driverId);
    if (e.user?.driver?.id) ids.add(e.user.driver.id);
  }
  return ids;
}
