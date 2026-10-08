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
  if (u.role === UserRole.ADMIN) {
    throw BusinessException.conflict('Estes dados sao da conta da Central. Use outros dados.', ERROR_CODES.CONFLICT);
  }
  const destino = telefoneDeVerdade(u.phone)
    ? `telefone terminado em ${u.phone.slice(-4)}`
    : u.email
      ? `e-mail ${mascararEmail(u.email)}`
      : 'conta sem contato';
  return { id: u.id, phone: u.phone, email: u.email, destino };
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
