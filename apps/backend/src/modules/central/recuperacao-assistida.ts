import { Injectable } from '@nestjs/common';
import { emailSchema, phoneSchema, UserRole } from '@ride/shared';
import { z } from 'zod';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { AvisosDeSeguranca } from '../auth/avisos-de-seguranca';
import { SessoesService } from '../auth/sessoes.service';
import { liberarTelefoneDeContaVazia } from '../auth/conta-existente';

/**
 * R3 (Requisicao de continuidade, 11/11/2026): a pessoa perdeu o telefone
 * antigo E o e-mail. So o DONO da Central libera, depois de conferir um
 * documento com foto (motorista: CPF e CNH do cadastro). Nada do documento
 * fica guardado: so o tipo e as conferencias marcadas. Tudo vai para a
 * auditoria (quem, motivo, resultado), liberado ou recusado.
 */
export const recuperacaoSchema = z
  .object({
    motivo: z.string().trim().min(10, 'Escreva o motivo (pelo menos 10 letras).').max(300),
    documento: z.enum(['CNH', 'RG', 'OUTRO_COM_FOTO']),
    conferencias: z.object({
      /** O rosto da foto do documento e o da pessoa (chamada de video ou presencial). */
      fotoConfere: z.boolean(),
      nomeConfere: z.boolean(),
      cpfConfere: z.boolean(),
      /** Motorista: numero da CNH igual ao do cadastro. */
      cnhConfere: z.boolean().optional(),
    }),
    /**
     * Obrigatorio: sem SMS, e por este e-mail que a pessoa volta a entrar
     * (codigo de 6 numeros). Telefone novo e opcional.
     */
    novoEmail: emailSchema,
    novoTelefone: phoneSchema.optional(),
  });

export type PedidoDeRecuperacao = z.infer<typeof recuperacaoSchema>;

/** Quais conferencias faltaram (vazio = pode liberar). Motorista tambem precisa da CNH. */
export function conferenciasQueFaltam(p: Pick<PedidoDeRecuperacao, 'conferencias'>, motorista: boolean): string[] {
  const c = p.conferencias;
  const faltam: string[] = [];
  if (!c.fotoConfere) faltam.push('foto do documento');
  if (!c.nomeConfere) faltam.push('nome');
  if (!c.cpfConfere) faltam.push('CPF');
  if (motorista && !c.cnhConfere) faltam.push('CNH');
  return faltam;
}

@Injectable()
export class RecuperacaoAssistidaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessoes: SessoesService,
    private readonly avisos: AvisosDeSeguranca,
  ) {}

  async recuperar(donoId: string, idInformado: string, p: PedidoDeRecuperacao) {
    const u = await this.prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ id: idInformado }, { driver: { id: idInformado } }] },
      select: { id: true, role: true, email: true, phone: true, driver: { select: { id: true } } },
    });
    if (!u) throw BusinessException.notFound('Cadastro nao encontrado.');
    // R5: a conta da Central tem procedimento proprio (docs/DUAS-ETAPAS-DONO.md).
    if (u.role === UserRole.ADMIN) {
      throw BusinessException.forbidden('Conta da Central nao e recuperada por aqui. Veja o procedimento excepcional (R5).');
    }
    const motorista = !!u.driver;
    const faltam = conferenciasQueFaltam(p, motorista);
    const registro = {
      motivo: p.motivo,
      documento: p.documento,
      conferencias: p.conferencias,
      motorista,
      campos: ['e-mail', p.novoTelefone ? 'telefone' : null].filter(Boolean),
    };
    if (faltam.length > 0) {
      await this.auditar(donoId, u.id, { ...registro, resultado: 'RECUSADA', faltaram: faltam });
      return { liberada: false, faltaram: faltam };
    }

    if (p.novoEmail !== u.email) {
      const dono = await this.prisma.user.findFirst({ where: { email: p.novoEmail, NOT: { id: u.id } }, select: { id: true } });
      if (dono) throw BusinessException.conflict('Este e-mail ja esta em outra conta.');
    }
    if (p.novoTelefone && p.novoTelefone !== u.phone) {
      const dono = await this.prisma.user.findFirst({ where: { phone: p.novoTelefone, NOT: { id: u.id } }, select: { id: true } });
      if (dono && !(await liberarTelefoneDeContaVazia(this.prisma, p.novoTelefone, u.id))) {
        throw BusinessException.conflict('Este telefone ja esta em outra conta.');
      }
    }

    // Aviso antes do corte (o corte apaga os enderecos de push); o e-mail
    // antigo tambem recebe, se ainda existir.
    await this.avisos.avisar(u.id, 'RECUPERACAO_PELA_CENTRAL', { emailAntigo: u.email });
    const corte = await this.sessoes.cortar(u.id);
    await this.prisma.user.update({
      where: { id: u.id },
      data: {
        email: p.novoEmail,
        emailVerifiedAt: null,
        ...(p.novoTelefone ? { phone: p.novoTelefone, phoneVerifiedAt: null } : {}),
        // A senha antiga pode estar com quem pegou a conta: deixa de valer.
        // A pessoa entra pelo codigo no e-mail novo e cria outra senha.
        passwordHash: null,
      },
    });
    await this.auditar(donoId, u.id, { ...registro, resultado: 'LIBERADA', sessoesEncerradas: corte.sessoesEncerradas });
    return { liberada: true, sessoesEncerradas: corte.sessoesEncerradas };
  }

  private async auditar(donoId: string, userId: string, after: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { actorId: donoId, actorRole: UserRole.ADMIN, action: 'RECUPERACAO_ASSISTIDA', entity: 'user', entityId: userId, after: after as never },
    });
  }
}
