import { Prisma, RideStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Historico de destinos do passageiro (etapas 3 e 4, Evandro 29/10/2026):
 * fica NO SERVIDOR e e so da conta. Vem das corridas que a pessoa fez; a
 * lixeira esconde um endereco (as corridas continuam no historico de
 * corridas, que e outra coisa) e "Apagar tudo" esconde todos os de antes.
 * Guardado em users.metadata (destinosOcultos, destinosApagadosEm): sem
 * mudar o banco.
 */
export interface DestinoDoHistorico {
  chave: string;
  address: string;
  latitude: number;
  longitude: number;
  ultimaVez: string;
  vezes: number;
}

const SEM_DESTINO = 'SEM_DESTINO';

/** Mesma rua no mesmo ponto (uns 11 m) = mesmo destino. */
export function chaveDoDestino(endereco: string, lat: number, lng: number): string {
  const texto = endereco
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${texto}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
}

interface Metadados {
  destinosOcultos?: string[];
  destinosApagadosEm?: string;
  [k: string]: unknown;
}

const lerMeta = (v: unknown): Metadados => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Metadados) : {});

const TERMINADAS: RideStatus[] = [RideStatus.COMPLETED, RideStatus.IN_PROGRESS, RideStatus.DRIVER_ASSIGNED, RideStatus.DRIVER_ARRIVING, RideStatus.DRIVER_WAITING];

export class HistoricoDeDestinos {
  constructor(private readonly prisma: PrismaService) {}

  async listar(userId: string, limite = 15): Promise<DestinoDoHistorico[]> {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const meta = lerMeta(usuario?.metadata);
    const ocultos = new Set(meta.destinosOcultos ?? []);
    const desde = meta.destinosApagadosEm ? new Date(meta.destinosApagadosEm) : null;
    const corridas = await this.prisma.ride.findMany({
      where: {
        passengerId: userId,
        status: { in: TERMINADAS },
        OR: [{ dropoffPlaceId: null }, { dropoffPlaceId: { not: SEM_DESTINO } }],
        ...(desde && !Number.isNaN(desde.getTime()) ? { requestedAt: { gt: desde } } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      select: { dropoffAddress: true, dropoffLat: true, dropoffLng: true, requestedAt: true },
    });
    const mapa = new Map<string, DestinoDoHistorico>();
    for (const c of corridas) {
      const chave = chaveDoDestino(c.dropoffAddress, c.dropoffLat, c.dropoffLng);
      if (ocultos.has(chave)) continue;
      const ja = mapa.get(chave);
      if (ja) {
        ja.vezes += 1;
        continue;
      }
      mapa.set(chave, {
        chave,
        address: c.dropoffAddress,
        latitude: c.dropoffLat,
        longitude: c.dropoffLng,
        ultimaVez: c.requestedAt.toISOString(),
        vezes: 1,
      });
    }
    return [...mapa.values()].slice(0, limite);
  }

  /** Lixeira: esconde um destino. A resposta ja e a lista nova (a tela so muda depois dela). */
  async esconder(userId: string, chave: string): Promise<DestinoDoHistorico[]> {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const meta = lerMeta(usuario?.metadata);
    const ocultos = [chave, ...(meta.destinosOcultos ?? []).filter((c) => c !== chave)].slice(0, 300);
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, destinosOcultos: ocultos } as Prisma.InputJsonValue },
    });
    return this.listar(userId);
  }

  /** Apagar tudo: nenhum destino de antes de agora aparece mais. */
  async apagarTudo(userId: string): Promise<DestinoDoHistorico[]> {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const meta = lerMeta(usuario?.metadata);
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, destinosOcultos: [], destinosApagadosEm: new Date().toISOString() } as Prisma.InputJsonValue },
    });
    return [];
  }
}
