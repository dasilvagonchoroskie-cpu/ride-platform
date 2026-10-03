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

/** Ate 2 MB por foto (o aplicativo reduz antes de mandar). */
const MAX_BYTES = 2 * 1024 * 1024;

/** Fotos que qualquer pessoa logada pode ver (o rosto de quem vai na corrida). */
const PUBLICAS = new Set(['AVATAR', 'PROFILE_PHOTO']);

@Injectable()
export class ArquivosService {
  constructor(private readonly prisma: PrismaService) {}

  private decodificar(mime: string, base64: string): Buffer {
    const confere = TIPOS_DE_IMAGEM[mime];
    if (!confere) throw BusinessException.validation('Envie uma foto em JPG, PNG ou WEBP.');
    const limpo = base64.replace(/^data:[^;]+;base64,/, '');
    const dados = Buffer.from(limpo, 'base64');
    if (dados.length === 0) throw BusinessException.validation('Foto vazia.');
    if (dados.length > MAX_BYTES) throw BusinessException.validation('Foto muito grande (até 2 MB).');
    if (!confere(dados)) throw BusinessException.validation('O arquivo não é uma foto válida.');
    return dados;
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
      await this.prisma.arquivo.deleteMany({ where: { id: { in: velhos.map((v) => v.fileKey) } } });
    }
    if (tipo === DocumentType.PROFILE_PHOTO) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: fileUrl } });
    }
    return { id: doc.id, type: doc.type, status: doc.status, fileUrl, uploadedAt: doc.uploadedAt };
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
