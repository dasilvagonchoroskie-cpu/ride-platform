import type { PrismaClient, Prisma } from '@prisma/client';

type Banco = PrismaClient | Prisma.TransactionClient;

/**
 * Jornada do motorista (tempo online).
 *
 * Abre quando ele fica disponivel, fecha quando sai. Enquanto esta
 * disponivel, o aparelho consulta chamados a cada poucos segundos e cada
 * consulta renova `lastSeenAt` — no maximo uma gravacao por minuto por
 * motorista, para nao martelar o banco gratuito.
 *
 * Se o celular apagar sem avisar, a jornada fica aberta mas o tempo so
 * conta ate o ultimo sinal (veja `segundosOnline`).
 */

/** Sem sinal por mais que isto, a jornada aberta e considerada encerrada. */
export const SILENCIO_MAXIMO_MS = 3 * 60 * 1000;

const ultimoToque = new Map<string, number>();

export async function abrirJornada(db: Banco, driverId: string): Promise<void> {
  await fecharJornada(db, driverId);
  await db.driverOnlineSession.create({ data: { driverId } });
  ultimoToque.set(driverId, Date.now());
}

export async function fecharJornada(db: Banco, driverId: string): Promise<void> {
  const abertas = await db.driverOnlineSession.findMany({ where: { driverId, endedAt: null } });
  const agora = Date.now();
  for (const j of abertas) {
    // Termina no ultimo sinal se ele sumiu ha muito tempo; senao, agora.
    const ultimo = j.lastSeenAt.getTime();
    const fim = agora - ultimo > SILENCIO_MAXIMO_MS ? new Date(ultimo) : new Date(agora);
    await db.driverOnlineSession.update({ where: { id: j.id }, data: { endedAt: fim, lastSeenAt: fim } });
  }
  ultimoToque.delete(driverId);
}

/** Renova o sinal de vida da jornada aberta (no maximo uma vez por minuto). */
export async function tocarJornada(db: Banco, driverId: string): Promise<void> {
  const agora = Date.now();
  const anterior = ultimoToque.get(driverId) ?? 0;
  if (agora - anterior < 60 * 1000) return;
  ultimoToque.set(driverId, agora);

  const aberta = await db.driverOnlineSession.findFirst({
    where: { driverId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!aberta) {
    // Ficou disponivel antes desta versao do servidor (ou o servidor
    // reiniciou): abre a jornada agora para o tempo comecar a contar.
    await db.driverOnlineSession.create({ data: { driverId } });
    return;
  }
  // Voltou depois de muito tempo calado: fecha a antiga no ultimo sinal
  // e abre outra, para nao contar o buraco como tempo online.
  if (agora - aberta.lastSeenAt.getTime() > SILENCIO_MAXIMO_MS) {
    await db.driverOnlineSession.update({
      where: { id: aberta.id },
      data: { endedAt: aberta.lastSeenAt },
    });
    await db.driverOnlineSession.create({ data: { driverId } });
    return;
  }
  await db.driverOnlineSession.update({ where: { id: aberta.id }, data: { lastSeenAt: new Date(agora) } });
}

/** Segundos online dentro do intervalo [de, ate). */
export async function segundosOnline(db: Banco, driverId: string, de: Date, ate: Date): Promise<number> {
  const jornadas = await db.driverOnlineSession.findMany({
    where: {
      driverId,
      startedAt: { lt: ate },
      OR: [{ endedAt: null }, { endedAt: { gt: de } }],
    },
  });
  const agora = Date.now();
  let total = 0;
  for (const j of jornadas) {
    let fim: number;
    if (j.endedAt) {
      fim = j.endedAt.getTime();
    } else {
      const ultimo = j.lastSeenAt.getTime();
      fim = agora - ultimo > SILENCIO_MAXIMO_MS ? ultimo : agora;
    }
    const inicio = Math.max(j.startedAt.getTime(), de.getTime());
    const final = Math.min(fim, ate.getTime());
    if (final > inicio) total += final - inicio;
  }
  return Math.round(total / 1000);
}
