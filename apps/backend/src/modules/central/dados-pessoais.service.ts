import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../../integrations/notifications/push.service';
import { liberarTelefoneDeContaVazia } from '../auth/conta-existente';

/**
 * Dados pessoais (Evandro, 10/10/2026): o passageiro muda os proprios dados
 * no app; o MOTORISTA pede a mudanca e so vale depois que a Central aprova;
 * a Central muda os dados de qualquer um (quando a pessoa pede).
 */

/** Campos que o motorista pode pedir para mudar. */
export interface DadosDoMotorista {
  name?: string;
  phone?: string;
  email?: string;
  endereco?: string;
  pixKey?: string;
  cnhNumber?: string;
  cnhCategory?: string;
  cnhExpiresAt?: Date | string;
}

/** A Central muda tambem CPF e nascimento. */
export interface DadosPelaCentral extends DadosDoMotorista {
  cpf?: string;
  birthDate?: Date | string;
}

const ROTULOS: Record<keyof DadosPelaCentral, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  endereco: 'Endereço',
  pixKey: 'Chave PIX',
  cnhNumber: 'Número da CNH',
  cnhCategory: 'Categoria da CNH',
  cnhExpiresAt: 'Validade da CNH',
  cpf: 'CPF',
  birthDate: 'Data de nascimento',
};

type Meta = Record<string, unknown>;

const metaDe = (m: unknown): Meta => (m && typeof m === 'object' && !Array.isArray(m) ? (m as Meta) : {});

const dia = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
};

/** (64) 99999-0000, 64999990000 ou +5564999990000 -> +5564999990000. */
export function normalizarTelefone(texto: string): string {
  const telefone = '+55' + texto.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (!/^\+55\d{10,11}$/.test(telefone)) throw BusinessException.validation('Telefone invalido: use DDD + numero.');
  return telefone;
}

@Injectable()
export class DadosPessoaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------------
  // Leitura
  // ------------------------------------------------------------------

  /** Pela conta (userId) ou pelo cadastro de motorista (driverId). */
  private async pessoa(id: string) {
    const u = await this.prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ id }, { driver: { id } }] },
      include: { driver: true },
    });
    if (!u) throw BusinessException.notFound('Cadastro nao encontrado.');
    return u;
  }

  /** Valores atuais, no mesmo formato do que pode ser pedido. */
  private atuais(u: Awaited<ReturnType<DadosPessoaisService['pessoa']>>): Record<keyof DadosPelaCentral, string | null> {
    const meta = metaDe(u.metadata);
    return {
      name: u.name,
      phone: u.phone.startsWith('+55') ? u.phone : null,
      email: u.email,
      endereco: typeof meta.endereco === 'string' ? meta.endereco : null,
      pixKey: u.driver?.pixKey ?? null,
      cnhNumber: u.driver?.cnhNumber ?? null,
      cnhCategory: u.driver?.cnhCategory ?? null,
      cnhExpiresAt: dia(u.driver?.cnhExpiresAt),
      cpf: u.driver?.cpf ?? u.cpf ?? null,
      birthDate: dia(u.driver?.birthDate ?? u.birthDate),
    };
  }

  /** Normaliza o que veio (telefone com +55, datas em AAAA-MM-DD). */
  private limpo(dados: DadosPelaCentral): Partial<Record<keyof DadosPelaCentral, string>> {
    const r: Partial<Record<keyof DadosPelaCentral, string>> = {};
    for (const [k, v] of Object.entries(dados) as [keyof DadosPelaCentral, unknown][]) {
      if (v === undefined || v === null || v === '') continue;
      if (k === 'phone') r.phone = normalizarTelefone(String(v));
      else if (k === 'cnhExpiresAt' || k === 'birthDate') {
        const d = dia(v as Date | string);
        if (!d) throw BusinessException.validation(`${ROTULOS[k]} invalida.`);
        r[k] = d;
      } else if (k === 'name') r.name = String(v).replace(/\s+/g, ' ').trim();
      else if (k === 'email') r.email = String(v).trim().toLowerCase();
      else if (k === 'cnhCategory') r.cnhCategory = String(v).trim().toUpperCase();
      else if (k === 'cpf' || k === 'cnhNumber') r[k] = String(v).replace(/\D/g, '');
      else r[k] = String(v).trim();
    }
    return r;
  }

  /** So o que muda de verdade, com o rotulo em portugues (para a Central conferir). */
  private mudancas(atual: Record<keyof DadosPelaCentral, string | null>, novo: Partial<Record<keyof DadosPelaCentral, string>>) {
    return (Object.keys(novo) as (keyof DadosPelaCentral)[])
      .filter((k) => novo[k] !== (atual[k] ?? undefined))
      .map((k) => ({ campo: k, rotulo: ROTULOS[k], de: atual[k] ?? null, para: novo[k] ?? null }));
  }

  /** Telefone, e-mail, CPF e CNH nao podem estar em outro cadastro. */
  private async garantirLivres(u: { id: string; driver: { id: string } | null }, novo: Partial<Record<keyof DadosPelaCentral, string>>) {
    // Sem filtrar excluidos: o banco nao deixa repetir nem com conta excluida.
    const outro = { NOT: { id: u.id } };
    if (novo.phone && (await this.prisma.user.findFirst({ where: { phone: novo.phone, ...outro }, select: { id: true } }))) {
      // Evandro (10/10/2026): o numero dele estava preso numa conta VAZIA
      // (entrou no app do motorista em 26/09 e nao terminou o cadastro; nao
      // aparece na Central). Conta vazia (sem corrida, sem pagamento, sem
      // e-mail, sem cadastro de motorista) e apagada e o numero fica livre.
      if (!(await liberarTelefoneDeContaVazia(this.prisma, novo.phone, u.id))) {
        throw BusinessException.conflict('Este telefone ja esta em outro cadastro.');
      }
    }
    if (novo.email && (await this.prisma.user.findFirst({ where: { email: novo.email, ...outro }, select: { id: true } }))) {
      throw BusinessException.conflict('Este e-mail ja esta em outro cadastro.');
    }
    if (novo.cpf) {
      if (!/^\d{11}$/.test(novo.cpf)) throw BusinessException.validation('CPF invalido (11 numeros).');
      const usado =
        (await this.prisma.user.findFirst({ where: { cpf: novo.cpf, ...outro }, select: { id: true } })) ||
        (await this.prisma.driver.findFirst({ where: { cpf: novo.cpf, NOT: { userId: u.id } }, select: { id: true } }));
      if (usado) throw BusinessException.conflict('Este CPF ja esta em outro cadastro.');
    }
    if (novo.cnhNumber) {
      const usada = await this.prisma.driver.findFirst({ where: { cnhNumber: novo.cnhNumber, NOT: { userId: u.id } }, select: { id: true } });
      if (usada) throw BusinessException.conflict('Esta CNH ja esta em outro cadastro.');
    }
    const soMotorista = (['pixKey', 'cnhNumber', 'cnhCategory', 'cnhExpiresAt'] as const).filter((k) => novo[k]);
    if (soMotorista.length > 0 && !u.driver) {
      throw BusinessException.validation(`${soMotorista.map((k) => ROTULOS[k]).join(', ')}: so para motorista.`);
    }
  }

  /** Grava de uma vez nos dois cadastros (pessoa e motorista). */
  private async gravar(userId: string, novo: Partial<Record<keyof DadosPelaCentral, string>>, metaExtra: Meta = {}) {
    const u = await this.pessoa(userId);
    const meta = metaDe(u.metadata);
    const dataUser: Prisma.UserUpdateInput = {
      ...(novo.name ? { name: novo.name } : {}),
      ...(novo.phone ? { phone: novo.phone } : {}),
      ...(novo.email ? { email: novo.email } : {}),
      ...(novo.cpf ? { cpf: novo.cpf } : {}),
      ...(novo.birthDate ? { birthDate: new Date(`${novo.birthDate}T00:00:00Z`) } : {}),
      metadata: { ...meta, ...(novo.endereco ? { endereco: novo.endereco } : {}), ...metaExtra } as never,
    };
    const dataDriver: Prisma.DriverUpdateInput = {
      ...(novo.pixKey ? { pixKey: novo.pixKey } : {}),
      ...(novo.cnhNumber ? { cnhNumber: novo.cnhNumber } : {}),
      ...(novo.cnhCategory ? { cnhCategory: novo.cnhCategory } : {}),
      ...(novo.cnhExpiresAt ? { cnhExpiresAt: new Date(`${novo.cnhExpiresAt}T00:00:00Z`) } : {}),
      ...(novo.cpf ? { cpf: novo.cpf } : {}),
      ...(novo.birthDate ? { birthDate: new Date(`${novo.birthDate}T00:00:00Z`) } : {}),
    };
    await this.prisma.withTransaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: dataUser });
      if (u.driver && Object.keys(dataDriver).length > 0) {
        await tx.driver.update({ where: { id: u.driver.id }, data: dataDriver });
      }
    });
  }

  // ------------------------------------------------------------------
  // Motorista: pede, a Central aprova
  // ------------------------------------------------------------------

  private situacao(meta: Meta) {
    const p = metaDe(meta.alteracaoPendente);
    const r = metaDe(meta.alteracaoRecusada);
    return {
      pendente: p.dados ? { pedidaEm: p.pedidaEm ?? null, mudancas: (p.mudancas as unknown[]) ?? [] } : null,
      ultimaRecusa: r.motivo ? { motivo: r.motivo, em: r.em ?? null } : null,
    };
  }

  async meusDados(userId: string) {
    const u = await this.pessoa(userId);
    return { dados: this.atuais(u), ...this.situacao(metaDe(u.metadata)) };
  }

  async pedirAlteracao(userId: string, dados: DadosDoMotorista) {
    const u = await this.pessoa(userId);
    if (!u.driver) throw BusinessException.forbidden('Esta conta nao tem cadastro de motorista.');
    const novo = this.limpo(dados);
    const mudancas = this.mudancas(this.atuais(u), novo);
    if (mudancas.length === 0) throw BusinessException.validation('Nada mudou nos seus dados.');
    const soQueMuda = Object.fromEntries(mudancas.map((m) => [m.campo, m.para])) as Partial<Record<keyof DadosPelaCentral, string>>;
    await this.garantirLivres(u, soQueMuda);
    const meta = metaDe(u.metadata);
    delete meta.alteracaoRecusada;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        metadata: { ...meta, alteracaoPendente: { dados: soQueMuda, mudancas, pedidaEm: new Date().toISOString() } } as never,
      },
    });
    return this.meusDados(userId);
  }

  async cancelarAlteracao(userId: string) {
    const u = await this.pessoa(userId);
    const meta = metaDe(u.metadata);
    delete meta.alteracaoPendente;
    await this.prisma.user.update({ where: { id: userId }, data: { metadata: meta as never } });
    return this.meusDados(userId);
  }

  /** Pedidos esperando a Central. */
  async pendentes() {
    // So as contas com pedido aberto (a Central consulta a cada 5 s).
    const comPedido = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users
      WHERE deleted_at IS NULL AND metadata -> 'alteracaoPendente' ->> 'pedidaEm' IS NOT NULL
    `;
    if (comPedido.length === 0) return [];
    const lista = await this.prisma.user.findMany({
      where: { id: { in: comPedido.map((c) => c.id) }, driver: { isNot: null } },
      select: { id: true, name: true, phone: true, metadata: true, driver: { select: { id: true } } },
    });
    return lista
      .map((u) => {
        const p = metaDe(metaDe(u.metadata).alteracaoPendente);
        return p.dados
          ? { userId: u.id, driverId: u.driver?.id ?? null, nome: u.name, telefone: u.phone, pedidaEm: p.pedidaEm ?? null, mudancas: p.mudancas ?? [] }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => String(a.pedidaEm).localeCompare(String(b.pedidaEm)));
  }

  async aprovar(adminId: string, id: string) {
    const u = await this.pessoa(id);
    const userId = u.id;
    const meta = metaDe(u.metadata);
    const p = metaDe(meta.alteracaoPendente);
    if (!p.dados) throw BusinessException.validation('Este motorista nao tem pedido de alteracao.');
    const novo = this.limpo(p.dados as DadosDoMotorista);
    await this.garantirLivres(u, novo);
    await this.gravar(userId, novo, {
      alteracaoPendente: null,
      ultimaAlteracao: { em: new Date().toISOString(), por: adminId, campos: Object.keys(novo) },
    });
    this.push.aviso(userId, 'Dados atualizados', 'A Central aprovou a mudança nos seus dados.');
    return { aprovado: true };
  }

  async recusar(adminId: string, id: string, motivo: string) {
    const u = await this.pessoa(id);
    const userId = u.id;
    const meta = metaDe(u.metadata);
    if (!metaDe(meta.alteracaoPendente).dados) throw BusinessException.validation('Este motorista nao tem pedido de alteracao.');
    delete meta.alteracaoPendente;
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, alteracaoRecusada: { motivo, em: new Date().toISOString(), por: adminId } } as never },
    });
    this.push.aviso(userId, 'Mudança nos dados recusada', motivo);
    return { recusado: true };
  }

  // ------------------------------------------------------------------
  // Central muda direto (passageiro ou motorista)
  // ------------------------------------------------------------------

  async dadosDaPessoa(id: string) {
    const u = await this.pessoa(id);
    return { userId: u.id, motorista: !!u.driver, dados: this.atuais(u), ...this.situacao(metaDe(u.metadata)) };
  }

  async editarPelaCentral(adminId: string, id: string, dados: DadosPelaCentral) {
    const u = await this.pessoa(id);
    const userId = u.id;
    const novo = this.limpo(dados);
    const mudancas = this.mudancas(this.atuais(u), novo);
    if (mudancas.length === 0) throw BusinessException.validation('Nada mudou.');
    const soQueMuda = Object.fromEntries(mudancas.map((m) => [m.campo, m.para])) as Partial<Record<keyof DadosPelaCentral, string>>;
    await this.garantirLivres(u, soQueMuda);
    await this.gravar(userId, soQueMuda, {
      ultimaAlteracao: { em: new Date().toISOString(), por: adminId, campos: Object.keys(soQueMuda) },
    });
    return this.dadosDaPessoa(userId);
  }
}
