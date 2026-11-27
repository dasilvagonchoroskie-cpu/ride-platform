import { HttpStatus } from '@nestjs/common';
import { RideStatus, UserRole } from '@prisma/client';
import { ERROR_CODES } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import type { PrismaService } from '../../database/prisma.service';
import { CHAVE_PRACAS, lerListaDePracas, pracaDoPonto } from '../pracas/pracas.store';
import { ehEntrega } from '../entregas/entregas.regras';

/**
 * Codigo de embarque (Evandro, 27/11/2026): o passageiro diz 4 numeros e o
 * motorista digita para iniciar a viagem. Cada cidade liga ou desliga na
 * Central. O codigo nunca vai para o motorista: ele so digita o que ouviu.
 *
 * - Quem confere e o servidor.
 * - Entrega tem o codigo proprio dela; corrida lancada pelo motorista ou
 *   pela Central (passageiro sem o app na mao) nasce sem codigo.
 * - Desligar a cidade libera na hora as corridas abertas; ligar vale para os
 *   pedidos novos.
 */

/** Erros seguidos que param as tentativas por um tempo. */
export const ERROS_ANTES_DA_ESPERA = 5;
export const MINUTOS_DE_ESPERA = 10;
/** Total de erros numa corrida: depois disso o codigo nao e mais aceito. */
export const ERROS_NO_MAXIMO = 20;
export const ACAO_CODIGO_ERRADO = 'CODIGO_EMBARQUE_ERRADO';

/** Situacoes em que o passageiro ainda vai embarcar. */
const ANTES_DE_EMBARCAR: RideStatus[] = [
  RideStatus.SCHEDULED,
  RideStatus.REQUESTED,
  RideStatus.SEARCHING,
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_WAITING,
];

export interface CorridaComCodigo {
  id: string;
  pin: string | null;
  status: RideStatus;
  category: string;
  pickupLat: number;
  pickupLng: number;
}

/**
 * A cidade deste ponto pede o codigo? Fora de todas as cidades cadastradas:
 * pede (na duvida, o lado seguro).
 */
export async function cidadePedeCodigo(
  prisma: PrismaService,
  ponto: { latitude: number; longitude: number },
): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key: CHAVE_PRACAS } });
  const praca = pracaDoPonto(lerListaDePracas(s?.value), ponto);
  return praca ? praca.exigirCodigoEmbarque !== false : true;
}

/** Esta corrida, agora, so inicia com o codigo? */
export async function exigeCodigoDeEmbarque(prisma: PrismaService, corrida: CorridaComCodigo): Promise<boolean> {
  if (!corrida.pin || ehEntrega(corrida.category) || !ANTES_DE_EMBARCAR.includes(corrida.status)) return false;
  return cidadePedeCodigo(prisma, { latitude: corrida.pickupLat, longitude: corrida.pickupLng });
}

type Resultado = { tipo: 'certo' } | { tipo: 'errado'; restam: number } | { tipo: 'esperar'; minutos: number } | { tipo: 'bloqueado' };

const recusa = (code: string, mensagem: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new BusinessException(code as never, mensagem, status);

/**
 * Confere o codigo digitado pelo motorista; recusa com a explicacao. Os
 * erros ficam na auditoria e contam no banco, com a corrida travada: mandar
 * varios de uma vez nao fura o limite.
 */
export async function conferirCodigoDeEmbarque(
  prisma: PrismaService,
  corrida: CorridaComCodigo,
  driverId: string,
  digitado: string | undefined,
): Promise<void> {
  if (!(await exigeCodigoDeEmbarque(prisma, corrida))) return;
  const codigo = (digitado ?? '').trim();
  if (!codigo) {
    throw recusa(
      ERROR_CODES.BOARDING_CODE_REQUIRED,
      'Peça ao passageiro o código de embarque (4 números). Se não aparecer onde digitar, atualize o aplicativo do motorista.',
    );
  }
  // Formato errado e engano de digitacao: nao gasta tentativa.
  if (!/^\d{4}$/.test(codigo)) throw recusa(ERROR_CODES.BOARDING_CODE_INVALID, 'O código tem 4 números.');

  const r = await prisma.withTransaction(async (tx): Promise<Resultado> => {
    await tx.$queryRaw`SELECT id FROM rides WHERE id = ${corrida.id}::uuid FOR UPDATE`;
    const erros = await tx.auditLog.findMany({
      where: { entity: 'Ride', entityId: corrida.id, action: ACAO_CODIGO_ERRADO },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: ERROS_NO_MAXIMO,
    });
    if (erros.length >= ERROS_NO_MAXIMO) return { tipo: 'bloqueado' };
    // A cada 5 erros, 10 minutos de pausa.
    if (erros.length > 0 && erros.length % ERROS_ANTES_DA_ESPERA === 0) {
      const libera = erros[0].createdAt.getTime() + MINUTOS_DE_ESPERA * 60_000;
      if (Date.now() < libera) return { tipo: 'esperar', minutos: Math.ceil((libera - Date.now()) / 60_000) };
    }
    if (codigo === corrida.pin) return { tipo: 'certo' };
    await tx.auditLog.create({
      data: { actorRole: UserRole.DRIVER, action: ACAO_CODIGO_ERRADO, entity: 'Ride', entityId: corrida.id, after: { driverId } },
    });
    const total = erros.length + 1;
    if (total >= ERROS_NO_MAXIMO) return { tipo: 'bloqueado' };
    const resto = total % ERROS_ANTES_DA_ESPERA;
    if (resto === 0) return { tipo: 'esperar', minutos: MINUTOS_DE_ESPERA };
    return { tipo: 'errado', restam: ERROS_ANTES_DA_ESPERA - resto };
  });

  if (r.tipo === 'certo') return;
  if (r.tipo === 'errado') {
    throw recusa(
      ERROR_CODES.BOARDING_CODE_INVALID,
      `Código errado. Confira com o passageiro (${r.restam === 1 ? 'resta 1 tentativa' : `restam ${r.restam} tentativas`} antes de uma pausa).`,
    );
  }
  if (r.tipo === 'esperar') {
    throw recusa(
      ERROR_CODES.BOARDING_CODE_LOCKED,
      `Muitas tentativas erradas. Aguarde ${r.minutos} min ou fale com a Central.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  throw recusa(
    ERROR_CODES.BOARDING_CODE_LOCKED,
    'O código desta corrida foi bloqueado por excesso de erros. Confira o passageiro e fale com a Central.',
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
