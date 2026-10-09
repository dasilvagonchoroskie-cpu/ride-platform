import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { CHAVE_PRACAS, caixaDaPraca, lerListaDePracas, pracaDoPonto } from './pracas.store';
import type { Praca } from './pracas.store';

type Meta = Record<string, unknown>;

/**
 * Quem ve o que na Central, por cidade (praca).
 * - Dono: conta da Central SEM praca no cadastro. Ve tudo e pode filtrar.
 * - Operador: conta da Central COM praca (users.metadata.praca). Ve e mexe
 *   so na praca dele: motoristas, corridas, SOS, recargas, saques e
 *   relatorios. Tarifas, cupons, comissao, cidades, equipe e limpeza sao
 *   do dono.
 */
@Injectable()
export class PracasService {
  constructor(private readonly prisma: PrismaService) {}

  private cache: { em: number; lista: Praca[] } | null = null;
  private readonly escopos = new Map<string, { em: number; praca: string | null }>();
  private motoristas: { em: number; mapa: Map<string, string | null> } | null = null;

  // ------------------------------------------------------------------
  // Cadastro das pracas
  // ------------------------------------------------------------------

  async listar(): Promise<Praca[]> {
    if (this.cache && Date.now() - this.cache.em < 30_000) return this.cache.lista;
    const s = await this.prisma.setting.findUnique({ where: { key: CHAVE_PRACAS } });
    const lista = lerListaDePracas(s?.value);
    this.cache = { em: Date.now(), lista };
    return lista;
  }

  async gravar(lista: Praca[], adminId?: string): Promise<Praca[]> {
    await this.prisma.setting.upsert({
      where: { key: CHAVE_PRACAS },
      update: { value: lista as never, updatedBy: adminId },
      create: { key: CHAVE_PRACAS, value: lista as never, updatedBy: adminId, description: 'Cidades atendidas (pracas)' },
    });
    this.cache = null;
    this.motoristas = null;
    return this.listar();
  }

  async buscar(id: string | null | undefined): Promise<Praca | null> {
    if (!id) return null;
    return (await this.listar()).find((p) => p.id === id) ?? null;
  }

  async doPonto(ponto: { latitude: number; longitude: number }): Promise<Praca | null> {
    return pracaDoPonto(await this.listar(), ponto);
  }

  // ------------------------------------------------------------------
  // Quem esta pedindo
  // ------------------------------------------------------------------

  /** Praca do operador; null = dono (ve todas). */
  async escopoDe(userId: string): Promise<string | null> {
    const c = this.escopos.get(userId);
    if (c && Date.now() - c.em < 60_000) return c.praca;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true, role: true } });
    const meta = (u?.metadata ?? {}) as Meta;
    const praca = u?.role === UserRole.ADMIN && typeof meta.praca === 'string' && meta.praca ? meta.praca : null;
    this.escopos.set(userId, { em: Date.now(), praca });
    return praca;
  }

  esquecerEscopo(userId: string): void {
    this.escopos.delete(userId);
  }

  /**
   * A praca que vale para filtrar este pedido: operador -> a dele, sempre;
   * dono -> a que ele escolheu na Central (ou null = todas).
   */
  async filtro(user: AuthenticatedUser | undefined, pedida?: string | null): Promise<string | null> {
    if (!user) return null;
    const minha = await this.escopoDe(user.id);
    if (minha) return minha;
    const p = pedida && pedida !== 'todas' ? await this.buscar(pedida) : null;
    return p?.id ?? null;
  }

  async exigirDono(user: AuthenticatedUser | undefined): Promise<void> {
    if (!user) throw BusinessException.forbidden('Sem permissao.');
    if (await this.escopoDe(user.id)) {
      throw BusinessException.forbidden('So o dono da Central pode mexer nisto.');
    }
  }

  /** O operador so mexe no que e da praca dele. */
  async exigirAcesso(user: AuthenticatedUser | undefined, pracaDoItem: string | null): Promise<void> {
    if (!user) throw BusinessException.forbidden('Sem permissao.');
    const minha = await this.escopoDe(user.id);
    if (minha && minha !== pracaDoItem) {
      throw BusinessException.forbidden('Isto e de outra cidade. Voce so ve e mexe na sua cidade.');
    }
  }

  // ------------------------------------------------------------------
  // Corridas, motoristas e SOS de cada praca
  // ------------------------------------------------------------------

  /** Filtro das corridas da praca (pelo ponto de embarque). */
  async ondeCorridas(praca: string | null): Promise<Prisma.RideWhereInput> {
    if (!praca) return {};
    const p = await this.buscar(praca);
    if (!p) return { id: { in: [] } };
    const c = caixaDaPraca(p);
    return { pickupLat: { gte: c.latMin, lte: c.latMax }, pickupLng: { gte: c.lngMin, lte: c.lngMax } };
  }

  /** Filtro dos alertas de SOS da praca (pela posicao do alerta). */
  async ondeSos(praca: string | null): Promise<Prisma.SafetyEventWhereInput> {
    if (!praca) return {};
    const p = await this.buscar(praca);
    if (!p) return { id: { in: [] } };
    const c = caixaDaPraca(p);
    return { latitude: { gte: c.latMin, lte: c.latMax }, longitude: { gte: c.lngMin, lte: c.lngMax } };
  }

  /** Praca de cada motorista: a escolhida no cadastro ou, sem ela, onde ele esta. */
  async mapaDeMotoristas(): Promise<Map<string, string | null>> {
    if (this.motoristas && Date.now() - this.motoristas.em < 10_000) return this.motoristas.mapa;
    const pracas = await this.listar();
    const linhas = await this.prisma.$queryRaw<Array<{ id: string; praca: string | null; lat: number | null; lng: number | null }>>`
      SELECT d.id, u.metadata->>'praca' AS praca,
             ST_Y(dl.location::geometry) AS lat, ST_X(dl.location::geometry) AS lng
      FROM drivers d JOIN users u ON u.id = d.user_id
      LEFT JOIN driver_locations dl ON dl.driver_id = d.id`;
    const mapa = new Map<string, string | null>();
    for (const l of linhas) {
      const escolhida = l.praca && pracas.some((p) => p.id === l.praca) ? l.praca : null;
      const pelaPosicao =
        l.lat != null && l.lng != null ? pracaDoPonto(pracas, { latitude: Number(l.lat), longitude: Number(l.lng) })?.id ?? null : null;
      mapa.set(l.id, escolhida ?? pelaPosicao ?? (pracas.length === 1 ? pracas[0].id : null));
    }
    this.motoristas = { em: Date.now(), mapa };
    return mapa;
  }

  esquecerMotoristas(): void {
    this.motoristas = null;
  }

  /** Ids dos motoristas da praca (null = sem filtro). */
  async idsDeMotoristas(praca: string | null): Promise<string[] | null> {
    if (!praca) return null;
    const mapa = await this.mapaDeMotoristas();
    return [...mapa.entries()].filter(([, p]) => p === praca).map(([id]) => id);
  }

  async pracaDoMotorista(driverId: string): Promise<string | null> {
    return (await this.mapaDeMotoristas()).get(driverId) ?? null;
  }

  async pracaDaCorrida(rideId: string): Promise<string | null> {
    const r = await this.prisma.ride.findUnique({ where: { id: rideId }, select: { pickupLat: true, pickupLng: true } });
    if (!r) return null;
    return (await this.doPonto({ latitude: r.pickupLat, longitude: r.pickupLng }))?.id ?? null;
  }

  /** Grava a praca do motorista (cadastro dele ou escolha do dono). */
  async definirPracaDoMotorista(userId: string, praca: string | null): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const meta = { ...((u?.metadata ?? {}) as Meta) };
    if (praca) meta.praca = praca;
    else delete meta.praca;
    await this.prisma.user.update({ where: { id: userId }, data: { metadata: meta as never } });
    this.motoristas = null;
  }
}
