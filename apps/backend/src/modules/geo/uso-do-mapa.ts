import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Contador de pedidos a TomTom (busca, endereco, rota), para a plataforma
 * inteira — a cota e da chave, nao de cada celular (Evandro, 29/10/2026).
 *
 * Cota gratis da TomTom (pagina de precos, 29/10/2026), POR MES:
 * geocodificacao 20 mil, endereco do ponto 20 mil, rota 20 mil e busca de
 * lugares 2.500. As imagens do mapa (200 mil/mes) vao direto do celular
 * para a TomTom e cada app conta as suas.
 *
 * Regras:
 * - "economia": passou de 80% da parte do dia (cota do mes / 30) ou de 80%
 *   do mes -> o servidor deixa de fazer os pedidos que nao sao essenciais
 *   (busca de lugares, a segunda busca no Brasil todo, rota so para desenhar).
 * - "parado": chegou a 98% do mes, ou a TomTom respondeu 429/403 -> nao pede
 *   mais nada a TomTom ate o dia seguinte; os apps mostram a contingencia.
 *
 * Gravado na tabela settings (chave mapa.uso) a cada minuto: o servidor
 * gratis reinicia e nao pode esquecer o que ja gastou.
 */
export type ServicoDoMapa = 'geocode' | 'reverse' | 'routing' | 'search';

export const COTA_GRATIS_DO_MES: Record<ServicoDoMapa, number> = {
  geocode: 20_000,
  reverse: 20_000,
  routing: 20_000,
  search: 2_500,
};

const CHAVE = 'mapa.uso';
const SERVICOS: ServicoDoMapa[] = ['geocode', 'reverse', 'routing', 'search'];

export interface EstadoDoUso {
  dia: string;
  mes: string;
  hoje: Record<ServicoDoMapa, number>;
  noMes: Record<ServicoDoMapa, number>;
  /** TomTom respondeu limite (429/403): parado ate este instante (ms). */
  paradoAte: number;
}

const zerado = (): Record<ServicoDoMapa, number> => ({ geocode: 0, reverse: 0, routing: 0, search: 0 });

/** Dia e mes no horario de Brasilia. */
export function diaDeBrasilia(agora = new Date()): { dia: string; mes: string } {
  const d = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString();
  return { dia: d.slice(0, 10), mes: d.slice(0, 7) };
}

/** Meia-noite (Brasilia) seguinte, em ms. */
function proximaMeiaNoite(agora = Date.now()): number {
  const b = new Date(agora - 3 * 3600 * 1000);
  b.setUTCHours(24, 0, 0, 0);
  return b.getTime() + 3 * 3600 * 1000;
}

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
      this.estado = { dia, mes, hoje: zerado(), noMes: zerado(), paradoAte: 0 };
    } else if (this.estado.dia !== dia) {
      this.estado = { ...this.estado, dia, hoje: zerado() };
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
    return lista.some((x) => this.estado.hoje[x] >= this.parteDoDia(x) * 0.8 || this.estado.noMes[x] >= this.cota[x] * 0.8);
  }

  /** Pode pedir agora? Os nao essenciais param no modo economia. */
  pode(s: ServicoDoMapa, essencial: boolean, agora = Date.now()): boolean {
    if (this.parado(s, agora)) return false;
    if (!essencial && this.economia(s)) return false;
    return true;
  }

  contar(s: ServicoDoMapa): void {
    this.estado.hoje[s] += 1;
    this.estado.noMes[s] += 1;
  }

  /** A TomTom disse que acabou (429/403): para ate a meia-noite. */
  limiteDaTomTom(agora = Date.now()): void {
    this.estado.paradoAte = proximaMeiaNoite(agora);
  }

  resumo() {
    return {
      dia: this.estado.dia,
      mes: this.estado.mes,
      economia: this.economia(),
      parado: SERVICOS.some((s) => this.parado(s)),
      paradoAte: this.estado.paradoAte > Date.now() ? new Date(this.estado.paradoAte).toISOString() : null,
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

  contar(s: ServicoDoMapa): void {
    this.conta.atualizarDia();
    this.conta.contar(s);
    this.mudou = true;
  }

  limiteDaTomTom(): void {
    this.conta.limiteDaTomTom();
    this.mudou = true;
    void this.gravar();
  }

  economia(): boolean {
    this.conta.atualizarDia();
    return this.conta.economia();
  }

  parado(): boolean {
    this.conta.atualizarDia();
    return (['geocode', 'reverse', 'routing', 'search'] as ServicoDoMapa[]).some((s) => this.conta.parado(s));
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
        create: { key: CHAVE, value: this.conta.estado as never, description: 'Uso da TomTom (busca, endereco, rota) no dia e no mes' },
      });
    } catch (e) {
      this.mudou = true;
      this.logger.warn(`Nao gravou o uso do mapa: ${(e as Error).message}`);
    }
  }
}
