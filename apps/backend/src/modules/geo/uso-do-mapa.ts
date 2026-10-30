import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Contador de pedidos a TomTom (busca, endereco, rota), para a plataforma
 * inteira — a cota e da chave, nao de cada celular (Evandro, 29/10/2026).
 *
 * Cota gratis da TomTom (docs.tomtom.com/pricing, conferida em 29/10/2026:
 * "Free monthly requests per API"), POR MES: geocodificacao 20 mil, endereco
 * do ponto 20 mil, rota 20 mil, busca de lugares 2.500 e imagens do mapa 200
 * mil. As imagens vao direto do celular para a TomTom; cada app conta as suas
 * e manda o numero junto do /geo/mapa (contagem aproximada: o que o celular
 * baixou e ainda nao mandou nao entra).
 *
 * Regras:
 * - "alerta": passou de 70% da cota do mes (Central > Configuracoes > Mapa
 *   mostra o aviso; o registro do servidor avisa uma vez por mes).
 * - "economia": passou de 80% da parte do dia (cota do mes / 30) ou de 80%
 *   do mes -> o servidor deixa de fazer os pedidos que nao sao essenciais
 *   (busca de lugares, a segunda busca no Brasil todo, rota so para desenhar).
 * - "parado": chegou a 98% do mes, ou a TomTom recusou a chave (403) -> nao
 *   pede mais nada a TomTom por 30 minutos (depois tenta de novo); os apps
 *   mostram a contingencia. O 429 da TomTom e "pedidos demais no mesmo
 *   segundo" (nao e a cota): o ritmo.ts espera e tenta de novo, e aqui so
 *   conta (rajadas), sem parar nada.
 *
 * Gravado na tabela settings (chave mapa.uso) a cada minuto: o servidor
 * gratis reinicia e nao pode esquecer o que ja gastou.
 */
export type ServicoDoMapa = 'geocode' | 'reverse' | 'routing' | 'search' | 'tiles';

export const COTA_GRATIS_DO_MES: Record<ServicoDoMapa, number> = {
  geocode: 20_000,
  reverse: 20_000,
  routing: 20_000,
  search: 2_500,
  tiles: 200_000,
};

/** Alerta a 70% da cota do mes; economia a 80%. */
export const ALERTA = 0.7;
export const ECONOMIA = 0.8;

const CHAVE = 'mapa.uso';
const SERVICOS: ServicoDoMapa[] = ['geocode', 'reverse', 'routing', 'search', 'tiles'];

export interface EstadoDoUso {
  dia: string;
  mes: string;
  hoje: Record<ServicoDoMapa, number>;
  noMes: Record<ServicoDoMapa, number>;
  /** TomTom recusou (403): parado ate este instante (ms). */
  paradoAte: number;
  /** Vezes no dia em que a TomTom pediu "devagar" (429) mesmo com o ritmo. */
  rajadas?: number;
  /** Servicos que ja passaram de 70% neste mes (o aviso sai uma vez). */
  avisados?: string[];
}

const zerado = (): Record<ServicoDoMapa, number> => ({ geocode: 0, reverse: 0, routing: 0, search: 0, tiles: 0 });

/** Dia e mes no horario de Brasilia. */
export function diaDeBrasilia(agora = new Date()): { dia: string; mes: string } {
  const d = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString();
  return { dia: d.slice(0, 10), mes: d.slice(0, 7) };
}

/** Depois de um 403 da TomTom, espera 30 minutos e tenta de novo. */
export const PAUSA_DEPOIS_DO_403_MS = 30 * 60 * 1000;

/** Limites do mes (variavel TOMTOM_COTA_MES no Render, ex.: {"search":5000}). */
export function cotaDoMes(env: Record<string, string | undefined> = process.env): Record<ServicoDoMapa, number> {
  const cota = { ...COTA_GRATIS_DO_MES };
  try {
    const extra = env.TOMTOM_COTA_MES ? (JSON.parse(env.TOMTOM_COTA_MES) as Record<string, unknown>) : {};
    for (const s of SERVICOS) {
      const n = Number(extra[s]);
      if (Number.isFinite(n) && n > 0) cota[s] = Math.round(n);
    }
  } catch {
    // Variavel invalida: fica a cota gratis.
  }
  return cota;
}

/** Contas puras (testadas sem banco). */
export class ContaDoUso {
  constructor(
    public estado: EstadoDoUso,
    private readonly cota: Record<ServicoDoMapa, number>,
  ) {}

  static vazio(agora = new Date()): EstadoDoUso {
    const { dia, mes } = diaDeBrasilia(agora);
    return { dia, mes, hoje: zerado(), noMes: zerado(), paradoAte: 0 };
  }

  /** Virou o dia (ou o mes): zera o que precisa. */
  atualizarDia(agora = new Date()): void {
    const { dia, mes } = diaDeBrasilia(agora);
    if (this.estado.mes !== mes) {
      this.estado = { dia, mes, hoje: zerado(), noMes: zerado(), paradoAte: 0, avisados: [] };
    } else if (this.estado.dia !== dia) {
      this.estado = { ...this.estado, dia, hoje: zerado(), rajadas: 0 };
    }
  }

  parteDoDia(s: ServicoDoMapa): number {
    return Math.max(1, Math.floor(this.cota[s] / 30));
  }

  parado(s: ServicoDoMapa, agora = Date.now()): boolean {
    return agora < this.estado.paradoAte || this.estado.noMes[s] >= Math.floor(this.cota[s] * 0.98);
  }

  economia(s?: ServicoDoMapa): boolean {
    const lista = s ? [s] : SERVICOS;
    return lista.some((x) => this.estado.hoje[x] >= this.parteDoDia(x) * ECONOMIA || this.estado.noMes[x] >= this.cota[x] * ECONOMIA);
  }

  /** Servicos acima de 70% da cota do mes. */
  alertas(): ServicoDoMapa[] {
    return SERVICOS.filter((x) => this.estado.noMes[x] >= this.cota[x] * ALERTA);
  }

  /** Servicos que acabaram de passar de 70% (para avisar uma vez so). */
  alertasNovos(): ServicoDoMapa[] {
    const ja = new Set(this.estado.avisados ?? []);
    const novos = this.alertas().filter((s) => !ja.has(s));
    if (novos.length) this.estado.avisados = [...ja, ...novos];
    return novos;
  }

  /** Pode pedir agora? Os nao essenciais param no modo economia. */
  pode(s: ServicoDoMapa, essencial: boolean, agora = Date.now()): boolean {
    if (this.parado(s, agora)) return false;
    if (!essencial && this.economia(s)) return false;
    return true;
  }

  contar(s: ServicoDoMapa, n = 1): void {
    this.estado.hoje[s] += n;
    this.estado.noMes[s] += n;
  }

  /**
   * A TomTom recusou. 403 (chave ou cota): para 30 minutos. 429 / fila
   * (pedidos demais no mesmo segundo): so conta — passa sozinho.
   */
  limiteDaTomTom(status = 403, agora = Date.now()): void {
    if (status === 403) {
      this.estado.paradoAte = agora + PAUSA_DEPOIS_DO_403_MS;
    } else {
      this.estado.rajadas = (this.estado.rajadas ?? 0) + 1;
    }
  }

  resumo() {
    return {
      dia: this.estado.dia,
      mes: this.estado.mes,
      economia: this.economia(),
      alerta: this.alertas().length > 0,
      alertas: this.alertas().map((s) => ({ servico: s, porcento: Math.floor((this.estado.noMes[s] / this.cota[s]) * 100) })),
      parado: SERVICOS.some((s) => this.parado(s)),
      paradoAte: this.estado.paradoAte > Date.now() ? new Date(this.estado.paradoAte).toISOString() : null,
      rajadas: this.estado.rajadas ?? 0,
      servicos: SERVICOS.map((s) => ({
        servico: s,
        hoje: this.estado.hoje[s],
        parteDoDia: this.parteDoDia(s),
        noMes: this.estado.noMes[s],
        cotaDoMes: this.cota[s],
      })),
    };
  }
}

@Injectable()
export class UsoDoMapaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsoDoMapaService.name);
  private readonly conta = new ContaDoUso(ContaDoUso.vazio(), cotaDoMes());
  private mudou = false;
  private relogio?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const s = await this.prisma.setting.findUnique({ where: { key: CHAVE } });
      const v = s?.value as Partial<EstadoDoUso> | undefined;
      if (v && typeof v.dia === 'string' && typeof v.mes === 'string') {
        this.conta.estado = {
          dia: v.dia,
          mes: v.mes,
          hoje: { ...zerado(), ...(v.hoje ?? {}) },
          noMes: { ...zerado(), ...(v.noMes ?? {}) },
          paradoAte: Number(v.paradoAte) || 0,
          rajadas: Number(v.rajadas) || 0,
          avisados: Array.isArray(v.avisados) ? v.avisados.map(String) : [],
        };
      }
    } catch (e) {
      this.logger.warn(`Nao leu o uso do mapa: ${(e as Error).message}`);
    }
    this.conta.atualizarDia();
    this.relogio = setInterval(() => void this.gravar(), 60_000);
    this.relogio.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.relogio) clearInterval(this.relogio);
    await this.gravar();
  }

  pode(s: ServicoDoMapa, essencial: boolean): boolean {
    this.conta.atualizarDia();
    return this.conta.pode(s, essencial);
  }

  contar(s: ServicoDoMapa, n = 1): void {
    this.conta.atualizarDia();
    this.conta.contar(s, n);
    this.mudou = true;
    for (const novo of this.conta.alertasNovos()) {
      this.logger.warn(`ALERTA: a TomTom (${novo}) passou de 70% da cota gratis do mes.`);
    }
  }

  /** Imagens do mapa que os celulares baixaram (vem junto do /geo/mapa). */
  contarImagens(n: number): void {
    if (Number.isInteger(n) && n > 0) this.contar('tiles', Math.min(n, 20_000));
  }

  limiteDaTomTom(status = 403): void {
    this.conta.limiteDaTomTom(status);
    this.mudou = true;
    if (status === 403) void this.gravar();
  }

  economia(): boolean {
    this.conta.atualizarDia();
    return this.conta.economia();
  }

  parado(): boolean {
    this.conta.atualizarDia();
    return (['geocode', 'reverse', 'routing', 'search', 'tiles'] as ServicoDoMapa[]).some((s) => this.conta.parado(s));
  }

  resumo() {
    this.conta.atualizarDia();
    return this.conta.resumo();
  }

  private async gravar(): Promise<void> {
    if (!this.mudou) return;
    this.mudou = false;
    try {
      await this.prisma.setting.upsert({
        where: { key: CHAVE },
        update: { value: this.conta.estado as never },
        create: { key: CHAVE, value: this.conta.estado as never, description: 'Uso da TomTom (busca, endereco, rota, imagens) no dia e no mes' },
      });
    } catch (e) {
      this.mudou = true;
      this.logger.warn(`Nao gravou o uso do mapa: ${(e as Error).message}`);
    }
  }
}
