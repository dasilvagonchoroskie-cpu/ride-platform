import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole as PrismaUserRole, UserStatus } from '@prisma/client';
import { emailSchema, nameSchema, normalizePhone, passwordSchema, UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { hashPassword } from '../../common/utils/crypto.util';
import { PrismaService } from '../../database/prisma.service';
import { gravarCidades, lerCidades } from '../operacao/operacao.store';
import { PracasService } from './pracas.service';
import { codigoDaPraca } from './pracas.store';
import type { Praca } from './pracas.store';
import { SoDonoGuard } from './so-dono.guard';

const pracaSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  uf: z.string().trim().toUpperCase().length(2, 'UF com 2 letras (ex.: GO, RS).'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  raioKm: z.number().min(5).max(300).default(60),
  ativa: z.boolean().default(true),
  whatsapp: z
    .string()
    .regex(/^\d{10,13}$/, 'WhatsApp so com numeros, com DDI e DDD.')
    .nullable()
    .optional(),
});

const operadorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: z
    .string()
    .transform((t) => normalizePhone(t))
    .refine((t) => /^\+55\d{10,11}$/.test(t), 'Telefone invalido: use DDD + numero.'),
  password: passwordSchema,
  praca: z.string().trim().min(2).max(40),
});

const mudarOperadorSchema = z.object({
  praca: z.string().trim().min(2).max(40).optional(),
  ativo: z.boolean().optional(),
  password: passwordSchema.optional(),
});

/**
 * Cidades (pracas) e equipe da Central — Evandro, 08/10/2026: uma Central
 * so; o dono ve tudo e escolhe a cidade; a operadora de Teutonia entra com o
 * login dela e ve so Teutonia (operacao + recargas).
 */
@ApiTags('Admin - Cidades e equipe')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class PracasController {
  constructor(
    private readonly pracas: PracasService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('eu')
  @ApiOperation({ summary: 'Quem esta na Central: dono (todas as cidades) ou operador de uma cidade' })
  async eu(@CurrentUser() user: AuthenticatedUser) {
    const minha = await this.pracas.escopoDe(user.id);
    const todas = await this.pracas.listar();
    const visiveis = minha ? todas.filter((p) => p.id === minha) : todas;
    return {
      dono: !minha,
      praca: minha,
      pracaNome: minha ? (todas.find((p) => p.id === minha)?.nome ?? minha) : null,
      pracas: visiveis,
    };
  }

  @Get('pracas')
  @ApiOperation({ summary: 'Cidades atendidas (o operador ve so a dele)' })
  async listar(@CurrentUser() user: AuthenticatedUser) {
    const minha = await this.pracas.escopoDe(user.id);
    const todas = await this.pracas.listar();
    return { items: minha ? todas.filter((p) => p.id === minha) : todas };
  }

  @Post('pracas')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Abre uma cidade nova (centro no mapa e raio atendido)' })
  async criar(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(pracaSchema)) body: Omit<Praca, 'id'>) {
    const lista = await this.pracas.listar();
    let id = codigoDaPraca(body.nome, body.uf);
    // A praca padrao (sem cadastro) se chama "goiatuba": Goiatuba-GO reaproveita.
    if (id === 'goiatuba-go' && lista.some((p) => p.id === 'goiatuba')) id = 'goiatuba';
    if (lista.some((p) => p.id === id)) throw BusinessException.conflict(`${body.nome} - ${body.uf} ja esta cadastrada.`);
    const nova: Praca = { ...body, id, whatsapp: body.whatsapp ?? null };
    const salvas = await this.pracas.gravar([...lista, nova], adminId);
    // A cidade nova aparece tambem na lista de cidades do cadastro do passageiro.
    const cidades = await lerCidades(this.prisma as never);
    await gravarCidades(this.prisma as never, [...cidades, `${body.nome} - ${body.uf}`], adminId);
    return { items: salvas };
  }

  @Patch('pracas/:id')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Altera a cidade (nome, centro, raio, WhatsApp, ligada)' })
  async alterar(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(pracaSchema.partial())) body: Partial<Omit<Praca, 'id'>>,
  ) {
    const lista = await this.pracas.listar();
    if (!lista.some((p) => p.id === id)) throw BusinessException.notFound('Cidade nao encontrada.');
    const salvas = await this.pracas.gravar(
      lista.map((p) => (p.id === id ? { ...p, ...body, id, whatsapp: body.whatsapp === undefined ? p.whatsapp : body.whatsapp } : p)),
      adminId,
    );
    return { items: salvas };
  }

  @Patch('drivers/:id/praca')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Muda a cidade em que o motorista trabalha' })
  async pracaDoMotorista(
    @Param('id', new ParseUUIDPipe()) driverId: string,
    @Body(new ZodValidationPipe(z.object({ praca: z.string().trim().min(2).max(40) }))) body: { praca: string },
  ) {
    const p = await this.pracas.buscar(body.praca);
    if (!p) throw BusinessException.validation('Cidade nao encontrada.');
    const d = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
    if (!d) throw BusinessException.notFound('Motorista nao encontrado.');
    await this.pracas.definirPracaDoMotorista(d.userId, p.id);
    return { driverId, praca: p.id, pracaNome: p.nome };
  }

  // ------------------------------------------------------------------
  // Equipe: contas da Central por cidade
  // ------------------------------------------------------------------

  @Get('equipe')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Contas da Central (dono e operadores de cada cidade)' })
  async equipe() {
    const contas = await this.prisma.user.findMany({
      where: { role: PrismaUserRole.ADMIN, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, phone: true, status: true, metadata: true, lastLoginAt: true, createdAt: true },
    });
    const pracas = await this.pracas.listar();
    return {
      items: contas.map((c) => {
        const praca = ((c.metadata ?? {}) as Record<string, unknown>).praca;
        const id = typeof praca === 'string' && praca ? praca : null;
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          ativo: c.status === UserStatus.ACTIVE,
          dono: !id,
          praca: id,
          pracaNome: id ? (pracas.find((p) => p.id === id)?.nome ?? id) : null,
          lastLoginAt: c.lastLoginAt,
          createdAt: c.createdAt,
        };
      }),
    };
  }

  @Post('equipe')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Cria a conta do operador de uma cidade (entra na mesma Central)' })
  async criarOperador(@Body(new ZodValidationPipe(operadorSchema)) body: z.infer<typeof operadorSchema>) {
    const praca = await this.pracas.buscar(body.praca);
    if (!praca) throw BusinessException.validation('Escolha a cidade do operador.');
    const existe = await this.prisma.user.findFirst({ where: { OR: [{ email: body.email }, { phone: body.phone }] } });
    if (existe) {
      throw BusinessException.conflict(
        existe.email === body.email ? 'Ja existe uma conta com este e-mail.' : 'Ja existe uma conta com este telefone.',
      );
    }
    const u = await this.prisma.user.create({
      data: {
        role: PrismaUserRole.ADMIN,
        status: UserStatus.ACTIVE,
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
        metadata: { praca: praca.id, operador: true } as never,
        termsAcceptedAt: new Date(),
      },
      select: { id: true, name: true, email: true },
    });
    return { ...u, praca: praca.id, pracaNome: praca.nome };
  }

  @Patch('equipe/:id')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Muda a cidade, bloqueia/libera ou troca a senha do operador' })
  async mudarOperador(
    @CurrentUser('id') adminId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(mudarOperadorSchema)) body: z.infer<typeof mudarOperadorSchema>,
  ) {
    const u = await this.operador(id, adminId);
    const meta = { ...((u.metadata ?? {}) as Record<string, unknown>) };
    if (body.praca) {
      const p = await this.pracas.buscar(body.praca);
      if (!p) throw BusinessException.validation('Cidade nao encontrada.');
      meta.praca = p.id;
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        metadata: meta as never,
        ...(body.ativo === undefined ? {} : { status: body.ativo ? UserStatus.ACTIVE : UserStatus.BLOCKED }),
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      },
    });
    if (body.ativo === false || body.password) {
      // Bloqueado ou senha nova: derruba os logins abertos dele.
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    this.pracas.esquecerEscopo(id);
    return this.equipe();
  }

  @Delete('equipe/:id')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Apaga a conta do operador' })
  async apagarOperador(@CurrentUser('id') adminId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.operador(id, adminId);
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch {
      // Tem registros ligados (ex.: avaliacoes): fica bloqueada e anonimizada.
      await this.prisma.user.update({
        where: { id },
        data: { status: UserStatus.BLOCKED, deletedAt: new Date(), email: null, phone: `excl-${id.slice(0, 15)}` },
      });
    }
    this.pracas.esquecerEscopo(id);
    return this.equipe();
  }

  /** So contas de operador (com cidade) — o dono nao se apaga nem se rebaixa por aqui. */
  private async operador(id: string, adminId: string) {
    if (id === adminId) throw BusinessException.validation('Voce nao pode mudar a sua propria conta por aqui.');
    const u = await this.prisma.user.findUnique({ where: { id } });
    const praca = ((u?.metadata ?? {}) as Record<string, unknown>).praca;
    if (!u || u.role !== PrismaUserRole.ADMIN || typeof praca !== 'string' || !praca) {
      throw BusinessException.notFound('Operador nao encontrado.');
    }
    return u;
  }
}
