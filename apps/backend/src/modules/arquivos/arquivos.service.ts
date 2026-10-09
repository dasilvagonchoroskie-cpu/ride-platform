import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DocumentStatus, DocumentType, UserRole } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';

const TIPOS_DE_IMAGEM: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

/** So as chaves de fotos guardadas no banco (as antigas do storage nao sao uuid). */
export const soArquivosDoBanco = (chaves: string[]): string[] =>
  chaves.filter((k) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k));

/** Ate 2 MB por foto (o aplicativo reduz antes de mandar). */
const MAX_BYTES = 2 * 1024 * 1024;

/** Fotos que qualquer pessoa logada pode ver (o rosto de quem vai na corrida). */
// Rosto do motorista e foto do carro aparecem para o passageiro da corrida.
const PUBLICAS = new Set(['AVATAR', 'PROFILE_PHOTO', 'VEHICLE_FRONT']);

/** Confere e decodifica a foto mandada pelo aplicativo (base64). */
export function decodificarFoto(mime: string, base64: string): Buffer {
  const confere = TIPOS_DE_IMAGEM[mime];
  if (!confere) throw BusinessException.validation('Envie uma foto em JPG, PNG ou WEBP.');
  const limpo = base64.replace(/^data:[^;]+;base64,/, '');
  const dados = Buffer.from(limpo, 'base64');
  if (dados.length === 0) throw BusinessException.validation('Foto vazia.');
  if (dados.length > MAX_BYTES) throw BusinessException.validation('Foto muito grande (até 2 MB).');
  if (!confere(dados)) throw BusinessException.validation('O arquivo não é uma foto válida.');
  return dados;
}

@Injectable()
export class ArquivosService {
  constructor(private readonly prisma: PrismaService) {}

  private decodificar(mime: string, base64: string): Buffer {
    return decodificarFoto(mime, base64);
  }

  private async guardar(ownerId: string, tipo: string, mime: string, dados: Buffer): Promise<string> {
    const id = randomUUID();
    await this.prisma.arquivo.create({ data: { id, ownerId, tipo, mime, tamanho: dados.length, dados } });
    return id;
  }

  /** Foto de perfil (passageiro ou motorista). Troca a anterior. */
  async fotoDePerfil(userId: string, mime: string, base64: string): Promise<{ avatarUrl: string }> {
    const dados = this.decodificar(mime, base64);
    const antigos = await this.prisma.arquivo.findMany({ where: { ownerId: userId, tipo: 'AVATAR' }, select: { id: true } });
    const id = await this.guardar(userId, 'AVATAR', mime, dados);
    const avatarUrl = `/arquivos/${id}`;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    if (antigos.length) await this.prisma.arquivo.deleteMany({ where: { id: { in: antigos.map((a) => a.id) } } });
    return { avatarUrl };
  }

  /** Foto de documento do motorista: entra como pendente para a Central conferir. */
  async fotoDeDocumento(userId: string, tipo: DocumentType, mime: string, base64: string) {
    const motorista = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true } });
    if (!motorista) throw BusinessException.validation('Termine o cadastro de motorista antes de enviar documentos.');
    const driverId = motorista.id;
    const dados = this.decodificar(mime, base64);
    const id = await this.guardar(userId, tipo, mime, dados);
    const fileUrl = `/arquivos/${id}`;
    // A versao anterior ainda nao conferida sai (fica so a mais nova).
    const velhos = await this.prisma.driverDocument.findMany({
      where: { driverId, type: tipo, status: { not: DocumentStatus.APPROVED } },
      select: { id: true, fileKey: true },
    });
    const doc = await this.prisma.driverDocument.create({
      data: {
        driverId,
        type: tipo,
        status: DocumentStatus.PENDING,
        fileKey: id,
        fileUrl,
        mimeType: mime,
        sizeBytes: dados.length,
        uploadedAt: new Date(),
      },
    });
    if (velhos.length) {
      await this.prisma.driverDocument.deleteMany({ where: { id: { in: velhos.map((v) => v.id) } } });
      await this.prisma.arquivo.deleteMany({ where: { id: { in: soArquivosDoBanco(velhos.map((v) => v.fileKey)) } } });
    }
    // Foto de perfil: o passageiro ve o rosto para reconhecer o motorista.
    // Primeira foto (cadastro): ja aparece. Troca de quem ja tem foto
    // aprovada: a aprovada continua aparecendo ate a Central conferir a nova.
    const temAprovada =
      tipo === DocumentType.PROFILE_PHOTO &&
      (await this.prisma.driverDocument.count({ where: { driverId, type: tipo, status: DocumentStatus.APPROVED } })) > 0;
    if (tipo === DocumentType.PROFILE_PHOTO && !temAprovada) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: fileUrl } });
    }
    return { id: doc.id, type: doc.type, status: doc.status, fileUrl, uploadedAt: doc.uploadedAt, aguardaCentral: temAprovada };
  }

  /**
   * A Central poe ou troca a foto do motorista (Evandro, 09/10/2026: "tinha
   * que ter essa parte na Central tambem"). Tirada pela propria Central:
   * entra ja aprovada, vira a foto que o passageiro ve e substitui as outras.
   */
  async fotoDoMotoristaPelaCentral(driverId: string, adminId: string, mime: string, base64: string) {
    const motorista = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { id: true, userId: true } });
    if (!motorista) throw BusinessException.notFound('Motorista não encontrado.');
    const dados = this.decodificar(mime, base64);
    const id = await this.guardar(motorista.userId, DocumentType.PROFILE_PHOTO, mime, dados);
    const fileUrl = `/arquivos/${id}`;
    const agora = new Date();
    const antigos = await this.prisma.driverDocument.findMany({
      where: { driverId, type: DocumentType.PROFILE_PHOTO },
      select: { id: true, fileKey: true },
    });
    const doc = await this.prisma.driverDocument.create({
      data: {
        driverId,
        type: DocumentType.PROFILE_PHOTO,
        status: DocumentStatus.APPROVED,
        fileKey: id,
        fileUrl,
        mimeType: mime,
        sizeBytes: dados.length,
        uploadedAt: agora,
        reviewedAt: agora,
        reviewedBy: adminId,
      },
    });
    await this.prisma.user.update({ where: { id: motorista.userId }, data: { avatarUrl: fileUrl } });
    if (antigos.length) {
      await this.prisma.driverDocument.deleteMany({ where: { id: { in: antigos.map((a) => a.id) } } });
      await this.prisma.arquivo.deleteMany({ where: { id: { in: soArquivosDoBanco(antigos.map((a) => a.fileKey)) } } });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: UserRole.ADMIN,
        action: 'DRIVER_PHOTO_BY_CENTRAL',
        entity: 'Driver',
        entityId: driverId,
        after: { fileUrl },
      },
    });
    return { id: doc.id, type: doc.type, status: doc.status, fileUrl, avatarUrl: fileUrl };
  }

  /** Le a foto. Documento so o dono e a Central; rosto, qualquer pessoa logada. */
  async ler(id: string, quem: { id: string; role: UserRole }) {
    const a = await this.prisma.arquivo.findUnique({ where: { id } });
    if (!a) throw BusinessException.notFound('Foto não encontrada.');
    const pode = a.ownerId === quem.id || quem.role === UserRole.ADMIN || PUBLICAS.has(a.tipo);
    if (!pode) throw BusinessException.forbidden('Sem permissão para ver esta foto.');
    return a;
  }
}
