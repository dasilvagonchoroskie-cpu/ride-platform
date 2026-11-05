import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClubeBeneficio, ClubeParceiro } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { decodificarFoto } from '../arquivos/arquivos.service';
import {
  CATEGORIAS_PADRAO,
  CHAVE_CATEGORIAS_CLUBE,
  MAX_LOGO_BYTES,
  codigoDoMotorista,
  codigoDoQr,
  lerCodigoDoQr,
  nomeCurto,
  situacaoDoMotorista,
  type DadosDoBeneficio,
  type DadosDoParceiro,
} from './clube.regras';

const CRIAR_TABELAS = [
  `CREATE TABLE IF NOT EXISTS "clube_parceiros" (
  "id" UUID NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  "categoria" VARCHAR(60) NOT NULL,
  "descricao" VARCHAR(1000) NOT NULL DEFAULT '',
  "endereco" VARCHAR(300) NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "telefone" VARCHAR(20),
  "whatsapp" VARCHAR(20),
  "horario" VARCHAR(300) NOT NULL DEFAULT '',
  "vantagens" VARCHAR(1500) NOT NULL DEFAULT '',
  "condicoes" VARCHAR(1500) NOT NULL DEFAULT '',
  "logo_url" VARCHAR(80),
  "ativo" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_parceiros_pkey" PRIMARY KEY ("id")
)`,
  `CREATE INDEX IF NOT EXISTS "clube_parceiros_ativo_idx" ON "clube_parceiros"("ativo")`,
  `CREATE TABLE IF NOT EXISTS "clube_beneficios" (
  "id" UUID NOT NULL,
  "parceiro_id" UUID NOT NULL,
  "titulo" VARCHAR(120) NOT NULL,
  "descricao" VARCHAR(1000) NOT NULL DEFAULT '',
  "condicoes" VARCHAR(1000) NOT NULL DEFAULT '',
  "ativo" BOOLEAN NOT NULL DEFAULT TRUE,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_beneficios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clube_beneficios_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "clube_parceiros"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS "clube_beneficios_parceiro_id_idx" ON "clube_beneficios"("parceiro_id")`,
];

type ParceiroComBeneficios = ClubeParceiro & { beneficios: ClubeBeneficio[] };

@Injectable()
export class ClubeService implements OnModuleInit {
  private readonly logger = new Logger('Clube');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      for (const sql of CRIAR_TABELAS) await this.prisma.$executeRawUnsafe(sql);
    } catch (e) {
      this.logger.error(`Clube de Vantagens: nao preparou as tabelas: ${(e as Error).message}`);
    }
  }

  private async registrar(adminId: string, action: string, entityId: string | null, before?: unknown, after?: unknown) {
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'ADMIN',
        action,
        entity: 'clube',
        entityId,
        ...(before !== undefined ? { before: before as never } : {}),
        ...(after !== undefined ? { after: after as never } : {}),
      },
    });
  }

  /** Como a Central ve (tudo) e como o motorista ve (sem datas internas). */
  publico(p: ParceiroComBeneficios, quem: 'central' | 'motorista') {
    const beneficios = p.beneficios
      .filter((b) => quem === 'central' || b.ativo)
      .sort((a, b) => a.ordem - b.ordem || a.createdAt.getTime() - b.createdAt.getTime())
      .map((b) => ({
        id: b.id,
        titulo: b.titulo,
        descricao: b.descricao,
        condicoes: b.condicoes,
        ...(quem === 'central' ? { ativo: b.ativo, ordem: b.ordem } : {}),
      }));
    return {
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      descricao: p.descricao,
      endereco: p.endereco,
      latitude: p.latitude,
      longitude: p.longitude,
      telefone: p.telefone,
      whatsapp: p.whatsapp,
      horario: p.horario,
      vantagens: p.vantagens,
      condicoes: p.condicoes,
      logoUrl: p.logoUrl,
      beneficios,
      ...(quem === 'central' ? { ativo: p.ativo, cadastradoEm: p.createdAt.toISOString(), atualizadoEm: p.updatedAt.toISOString() } : {}),
    };
  }

  // ----------------------------------------------------------- Central

  async listarParaCentral(situacao?: 'ativos' | 'inativos') {
    const lista = await this.prisma.clubeParceiro.findMany({
      where: situacao === 'ativos' ? { ativo: true } : situacao === 'inativos' ? { ativo: false } : {},
      include: { beneficios: true },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return lista.map((p) => this.publico(p, 'central'));
  }

  private async achar(id: string): Promise<ParceiroComBeneficios> {
    const p = await this.prisma.clubeParceiro.findUnique({ where: { id }, include: { beneficios: true } });
    if (!p) throw BusinessException.notFound('Parceiro não encontrado.');
    return p;
  }

  async criar(adminId: string, d: DadosDoParceiro) {
    const p = await this.prisma.clubeParceiro.create({
      data: { ...d, latitude: d.latitude ?? null, longitude: d.longitude ?? null, telefone: d.telefone ?? null, whatsapp: d.whatsapp ?? null },
      include: { beneficios: true },
    });
    await this.registrar(adminId, 'CLUBE_PARCEIRO_CRIADO', p.id, undefined, { nome: p.nome, categoria: p.categoria });
    return this.publico(p, 'central');
  }

  async editar(adminId: string, id: string, d: DadosDoParceiro) {
    const antes = await this.achar(id);
    const p = await this.prisma.clubeParceiro.update({
      where: { id },
      data: { ...d, latitude: d.latitude ?? null, longitude: d.longitude ?? null, telefone: d.telefone ?? null, whatsapp: d.whatsapp ?? null },
      include: { beneficios: true },
    });
    await this.registrar(adminId, 'CLUBE_PARCEIRO_EDITADO', id, { nome: antes.nome, ativo: antes.ativo }, { nome: p.nome, ativo: p.ativo });
    return this.publico(p, 'central');
  }

  async ativar(adminId: string, id: string, ativo: boolean) {
    await this.achar(id);
    const p = await this.prisma.clubeParceiro.update({ where: { id }, data: { ativo }, include: { beneficios: true } });
    await this.registrar(adminId, ativo ? 'CLUBE_PARCEIRO_ATIVADO' : 'CLUBE_PARCEIRO_DESATIVADO', id);
    return this.publico(p, 'central');
  }

  /** Exclui o parceiro, os beneficios dele (em cascata) e o logotipo. */
  async excluir(adminId: string, id: string) {
    const p = await this.achar(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.clubeParceiro.delete({ where: { id } });
      const logo = idDoLogo(p.logoUrl);
      if (logo) await tx.arquivo.deleteMany({ where: { id: logo, tipo: 'CLUBE_LOGO' } });
    });
    await this.registrar(adminId, 'CLUBE_PARCEIRO_EXCLUIDO', id, { nome: p.nome, beneficios: p.beneficios.length });
    return { excluido: true };
  }

  async logo(adminId: string, id: string, mime: string, base64: string) {
    const p = await this.achar(id);
    const dados = decodificarFoto(mime, base64);
    if (dados.length > MAX_LOGO_BYTES) throw BusinessException.validation('Logotipo muito grande (até 500 KB).');
    const arquivo = randomUUID();
    await this.prisma.arquivo.create({ data: { id: arquivo, ownerId: adminId, tipo: 'CLUBE_LOGO', mime, tamanho: dados.length, dados } });
    const atualizado = await this.prisma.clubeParceiro.update({ where: { id }, data: { logoUrl: `/arquivos/${arquivo}` }, include: { beneficios: true } });
    const velho = idDoLogo(p.logoUrl);
    if (velho) await this.prisma.arquivo.deleteMany({ where: { id: velho, tipo: 'CLUBE_LOGO' } });
    await this.registrar(adminId, 'CLUBE_LOGO', id);
    return this.publico(atualizado, 'central');
  }

  async criarBeneficio(adminId: string, parceiroId: string, d: DadosDoBeneficio) {
    await this.achar(parceiroId);
    const b = await this.prisma.clubeBeneficio.create({ data: { ...d, parceiroId } });
    await this.registrar(adminId, 'CLUBE_BENEFICIO_CRIADO', parceiroId, undefined, { beneficio: b.id, titulo: b.titulo });
    return this.publico(await this.achar(parceiroId), 'central');
  }

  private async beneficioDo(parceiroId: string, id: string) {
    const b = await this.prisma.clubeBeneficio.findUnique({ where: { id } });
    if (!b || b.parceiroId !== parceiroId) throw BusinessException.notFound('Benefício não encontrado.');
    return b;
  }

  async editarBeneficio(adminId: string, parceiroId: string, id: string, d: DadosDoBeneficio) {
    const antes = await this.beneficioDo(parceiroId, id);
    await this.prisma.clubeBeneficio.update({ where: { id }, data: d });
    await this.registrar(adminId, 'CLUBE_BENEFICIO_EDITADO', parceiroId, { titulo: antes.titulo, ativo: antes.ativo }, { titulo: d.titulo, ativo: d.ativo });
    return this.publico(await this.achar(parceiroId), 'central');
  }

  async excluirBeneficio(adminId: string, parceiroId: string, id: string) {
    const b = await this.beneficioDo(parceiroId, id);
    await this.prisma.clubeBeneficio.delete({ where: { id } });
    await this.registrar(adminId, 'CLUBE_BENEFICIO_EXCLUIDO', parceiroId, { titulo: b.titulo });
    return this.publico(await this.achar(parceiroId), 'central');
  }

  async categorias(): Promise<string[]> {
    const s = await this.prisma.setting.findUnique({ where: { key: CHAVE_CATEGORIAS_CLUBE } });
    const v = s?.value;
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : CATEGORIAS_PADRAO;
  }

  async gravarCategorias(adminId: string, lista: string[]): Promise<string[]> {
    const limpa = Array.from(new Set(lista.map((c) => c.trim()).filter((c) => c.length >= 2)));
    await this.prisma.setting.upsert({
      where: { key: CHAVE_CATEGORIAS_CLUBE },
      update: { value: limpa as never, updatedBy: adminId },
      create: { key: CHAVE_CATEGORIAS_CLUBE, value: limpa as never, updatedBy: adminId, description: 'Clube de Vantagens: categorias dos estabelecimentos' },
    });
    await this.registrar(adminId, 'CLUBE_CATEGORIAS', null, undefined, { categorias: limpa });
    return limpa;
  }

  // ---------------------------------------------------------- Motorista

  async listarParaMotorista() {
    const lista = await this.prisma.clubeParceiro.findMany({
      where: { ativo: true },
      include: { beneficios: true },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
    });
    return lista.map((p) => this.publico(p, 'motorista'));
  }

  async detalheParaMotorista(id: string) {
    const p = await this.prisma.clubeParceiro.findUnique({ where: { id }, include: { beneficios: true } });
    if (!p || !p.ativo) throw BusinessException.notFound('Este parceiro não está mais no clube.');
    return this.publico(p, 'motorista');
  }

  /** Carteirinha do motorista logado (dados vem do cadastro; ele nao edita). */
  async carteirinha(userId: string, base: string) {
    const m = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true, status: true, user: { select: { name: true, status: true } } },
    });
    if (!m) throw BusinessException.notFound('Cadastro de motorista não encontrado.');
    const situacao = situacaoDoMotorista(m.status, m.user.status !== 'ACTIVE');
    const { codigo, validoAte } = codigoDoQr(m.id, this.config.jwt.accessSecret);
    return {
      nome: m.user.name,
      codigo: codigoDoMotorista(m.id),
      situacao: situacao.codigo,
      situacaoTexto: situacao.texto,
      qr: `${base}/api/clube/validar/${codigo}`,
      qrValidoAte: validoAte.toISOString(),
    };
  }

  /** O comerciante le o QR: confere no servidor, sem mostrar dados pessoais. */
  async validar(codigo: string) {
    const lido = lerCodigoDoQr(codigo, this.config.jwt.accessSecret);
    if (!lido) return { valida: false as const, motivo: 'Identificação inválida: este QR Code não é da Fortaleza Move.' };
    if (lido.vencido) return { valida: false as const, motivo: 'QR Code vencido. Peça ao motorista para abrir a identificação de novo no aplicativo.' };
    const m = await this.prisma.driver.findUnique({
      where: { id: lido.driverId },
      select: { id: true, status: true, user: { select: { name: true, status: true, deletedAt: true } } },
    });
    if (!m || m.user.deletedAt) return { valida: false as const, motivo: 'Motorista não encontrado.' };
    const situacao = situacaoDoMotorista(m.status, m.user.status !== 'ACTIVE');
    return {
      valida: situacao.codigo === 'ATIVO',
      nome: nomeCurto(m.user.name),
      codigo: codigoDoMotorista(m.id),
      situacao: situacao.texto,
      validoAte: lido.validoAte.toISOString(),
      ...(situacao.codigo === 'ATIVO' ? {} : { motivo: situacao.texto }),
    };
  }
}

export function idDoLogo(url: string | null | undefined): string | null {
  const m = /^\/arquivos\/([0-9a-f-]{36})$/i.exec(url ?? '');
  return m ? m[1] : null;
}
