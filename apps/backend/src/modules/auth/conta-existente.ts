import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { ERROR_CODES } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';

/** Dados que identificam uma pessoa no cadastro de motorista. */
export interface DadosDaPessoa {
  email?: string | null;
  cpf?: string | null;
  cnhNumber?: string | null;
  phone?: string | null;
}

export interface ContaExistente {
  id: string;
  phone: string;
  email: string | null;
  /** "telefone terminado em 6632" (ou o e-mail mascarado). */
  destino: string;
}

const telefoneDeVerdade = (t?: string | null) => !!t && !t.startsWith('pend-');

function mascararEmail(e: string): string {
  const [nome, dominio] = e.split('@');
  return `${nome.slice(0, 1)}•••@${dominio ?? ''}`;
}

/**
 * Outra conta (que nao a logada) com o mesmo e-mail, CPF, CNH ou telefone.
 *
 * Regra do Evandro (08/10/2026): "se o motorista tem conta no aplicativo de
 * passageiro, isso nao pode impedir" — e a MESMA pessoa. Em vez de recusar,
 * o app confirma com um codigo enviado a essa conta e passa a usa-la.
 */
export async function acharContaComOsMesmosDados(
  prisma: PrismaService,
  userId: string,
  dados: DadosDaPessoa,
): Promise<ContaExistente | null> {
  const ou: Prisma.UserWhereInput[] = [];
  if (dados.email) ou.push({ email: dados.email.trim().toLowerCase() });
  if (dados.cpf) ou.push({ cpf: dados.cpf }, { driver: { cpf: dados.cpf } });
  if (dados.cnhNumber) ou.push({ driver: { cnhNumber: dados.cnhNumber } });
  if (telefoneDeVerdade(dados.phone)) ou.push({ phone: dados.phone! });
  if (ou.length === 0) return null;
  const u = await prisma.user.findFirst({
    where: { id: { not: userId }, status: { not: UserStatus.DELETED }, OR: ou },
    select: { id: true, role: true, phone: true, email: true },
  });
  if (!u) return null;
  // Conta vazia presa so pelo telefone: libera em vez de pedir codigo para
  // uma conta que nao tem para onde mandar.
  if (telefoneDeVerdade(dados.phone) && u.phone === dados.phone && !u.email && (await contaVaziaSemEmail(prisma, u.id))) {
    await prisma.user.delete({ where: { id: u.id } });
    return acharContaComOsMesmosDados(prisma, userId, dados);
  }
  if (u.role === UserRole.ADMIN) {
    throw BusinessException.conflict('Estes dados sao da conta da Central. Use outros dados.', ERROR_CODES.CONFLICT);
  }
  // Sem SMS o codigo vai para o e-mail da conta: e ele que aparece.
  const destino = u.email
    ? `e-mail ${mascararEmail(u.email)}`
    : telefoneDeVerdade(u.phone)
      ? `telefone terminado em ${u.phone.slice(-4)}`
      : 'conta sem contato';
  return { id: u.id, phone: u.phone, email: u.email, destino };
}

/**
 * Conta que so tem o telefone: nunca terminou cadastro, sem e-mail, sem
 * corrida, sem cadastro de motorista. Sem SMS, ninguem consegue mais entrar
 * nela (o codigo vai para o e-mail da conta, e ela nao tem). Ela nao pode
 * prender o telefone de quem vai criar a conta de verdade pelo e-mail.
 */
export async function contaVaziaSemEmail(prisma: PrismaService, userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      metadata: true,
      driver: { select: { id: true } },
      _count: { select: { ridesAsPassenger: true, payments: true, ratingsGiven: true, ratingsReceived: true } },
    },
  });
  if (!u || u.email || u.role === UserRole.ADMIN || u.driver) return false;
  if ((u.metadata as { cadastroCompleto?: boolean } | null)?.cadastroCompleto === true) return false;
  const c = u._count;
  return c.ridesAsPassenger + c.payments + c.ratingsGiven + c.ratingsReceived === 0;
}

/** Apaga a conta vazia que prendia o telefone. Devolve true se apagou. */
export async function liberarTelefoneDeContaVazia(prisma: PrismaService, phone: string, exceto: string): Promise<boolean> {
  const dono = await prisma.user.findFirst({ where: { phone, NOT: { id: exceto } }, select: { id: true } });
  if (!dono || !(await contaVaziaSemEmail(prisma, dono.id))) return false;
  await prisma.user.delete({ where: { id: dono.id } });
  return true;
}

/** Recusa do cadastro quando os dados sao de outra conta da mesma pessoa. */
export function erroContaExistente(conta: ContaExistente): BusinessException {
  return new BusinessException(
    ERROR_CODES.CONTA_EXISTENTE,
    `Voce ja tem conta na Fortaleza Mov com estes dados (${conta.destino}). ` +
      'Confirme com o codigo para usar a mesma conta no app do motorista.',
    409,
    { destino: conta.destino },
  );
}
