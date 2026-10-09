import { Prisma } from '@prisma/client';
import { haversineKm } from '@ride/shared';

/**
 * Como a corrida e cobrada (Evandro, 08/10/2026: "aparecer o valor, a
 * contagem do valor na corrida").
 * - TAXIMETRO (padrao): o valor corre durante a viagem, pelo trajeto feito,
 *   pelo tempo de viagem e pela espera no embarque — como um taxi.
 * - FECHADO: cobra o valor estimado no pedido, qualquer que seja o trajeto.
 * Guardado em settings; a Central troca em Tarifas.
 */
export type ModoCobranca = 'TAXIMETRO' | 'FECHADO';

export const CHAVE_COBRANCA = 'corrida.cobranca';

type Db = Pick<Prisma.TransactionClient, 'setting'>;

export async function lerCobranca(db: Db): Promise<ModoCobranca> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_COBRANCA } });
  return s?.value === 'FECHADO' ? 'FECHADO' : 'TAXIMETRO';
}

export async function gravarCobranca(db: Db, modo: ModoCobranca): Promise<void> {
  await db.setting.upsert({
    where: { key: CHAVE_COBRANCA },
    create: { key: CHAVE_COBRANCA, value: modo, description: 'Como a corrida e cobrada: TAXIMETRO ou FECHADO' },
    update: { value: modo },
  });
}

type Ponto = { latitude: number; longitude: number };

/**
 * Distancia que vale no fim da corrida pelo taximetro.
 *
 * O celular mede o trajeto pelo GPS; o servidor so confere se e possivel:
 * - menos que a linha reta do embarque ao ponto onde terminou e impossivel
 *   (GPS falhou, aplicativo reiniciado): vale o caminho pelas ruas ate ali;
 * - mais que 3 vezes o caminho pelas ruas (+2 km de folga para desvio) e
 *   salto de GPS: fica no teto.
 * Sem medicao nenhuma e sem saber onde terminou: a estimativa do pedido.
 */
export async function distanciaDoTaximetro(params: {
  medida: number | null | undefined;
  embarque: Ponto;
  fim: Ponto | null;
  estimadaMetros: number;
  porRuaAte: (fim: Ponto) => Promise<number>;
}): Promise<number> {
  const { medida, embarque, fim, estimadaMetros } = params;
  const reta = fim ? Math.round(haversineKm(embarque, fim) * 1000) : 0;
  if (medida != null && medida >= reta * 0.9) {
    if (!fim || reta < 300) return Math.round(Math.min(medida, Math.max(estimadaMetros, reta) * 3 + 2000));
    const porRua = await params.porRuaAte(fim);
    return Math.round(Math.min(medida, Math.max(porRua, reta) * 3 + 2000));
  }
  if (fim && reta >= 300) return Math.round(await params.porRuaAte(fim));
  if (medida != null) return Math.round(Math.max(medida, reta));
  return estimadaMetros;
}

/**
 * Paradas da viagem que valem (Evandro, 09/10/2026: "se teve tempo parado,
 * as vezes o passageiro quis que aguardasse um pouquinho"). O celular do
 * motorista conta cada parada de 1 minuto ou mais; o servidor so aceita o
 * que cabe: nunca mais que o tempo da viagem menos o minimo para rodar a
 * distancia (a 80 km/h), nem mais que 4 horas.
 */
export function paradasQueValem(informadas: number | null | undefined, duracaoSegundos: number, distanciaMetros: number): number {
  if (!informadas || informadas <= 0) return 0;
  const minimoRodando = distanciaMetros / 22.2;
  const cabe = Math.max(0, Math.floor(duracaoSegundos - minimoRodando));
  return Math.max(0, Math.min(Math.round(informadas), cabe, 4 * 3600));
}
