import { Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, DocumentStatus, DocumentType, REQUIRED_DRIVER_DOCUMENTS } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip } from '../../common/dto/pagination.dto';
import { StorageService } from '../../integrations/storage/storage.service';
import { DriversService } from '../drivers/drivers.service';
import { RequestDocumentUploadInput, ReviewDocumentInput } from '@ride/shared';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly drivers: DriversService,
  ) {}

  /** Passo 1: devolve URL assinada para o app enviar o arquivo direto ao storage. */
  async requestUpload(userId: string, input: RequestDocumentUploadInput) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    const key = this.storage.buildDocumentKey(driver.id, input.type, input.fileName);
    const presigned = await this.storage.createPresignedUpload({
      key,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    const document = await this.prisma.driverDocument.create({
      data: {
        driverId: driver.id,
        type: input.type,
        status: DocumentStatus.PENDING,
        fileKey: key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
    });

    return {
      documentId: document.id,
      type: document.type,
      uploadUrl: presigned.uploadUrl,
      expiresIn: presigned.expiresIn,
      fileKey: presigned.documentKey,
      // O app deve enviar o arquivo com PUT e header Content-Type igual ao informado.
      requiredHeaders: { 'Content-Type': input.mimeType },
    };
  }

  /** Passo 2: confirma que o upload terminou e marca o documento como enviado. */
  async confirmUpload(userId: string, documentId: string, checksum?: string) {
    const document = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driver: { userId } },
    });

    if (!document) throw BusinessException.notFound('Documento nao encontrado.');
    if (document.uploadedAt) return this.toPublic(document);

    const exists = await this.storage.exists(document.fileKey);
    if (!exists) {
      throw BusinessException.validation(
        'Arquivo nao encontrado no storage. Reenvie o documento (a URL de upload expira).',
      );
    }

    const updated = await this.prisma.driverDocument.update({
      where: { id: document.id },
      data: { uploadedAt: new Date(), checksum, status: DocumentStatus.PENDING },
    });

    await this.refreshDriverStatusAfterUpload(userId);
    return this.toPublic(updated);
  }

  async listMine(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    const documents = await this.prisma.driverDocument.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
    });

    const progress = await this.drivers.getDocumentProgress(driver.id);

    return {
      documents: await Promise.all(documents.map((doc) => this.withSignedUrl(doc))),
      progress,
    };
  }

  async adminList(params: {
    page: number;
    limit: number;
    driverId?: string;
    status?: DocumentStatus;
    type?: DocumentType;
  }) {
    const where = {
      ...(params.driverId ? { driverId: params.driverId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.driverDocument.findMany({
        where,
        skip: toSkip(params.page, params.limit),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: {
            select: {
              id: true,
              status: true,
              user: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
        },
      }),
      this.prisma.driverDocument.count({ where }),
    ]);

    const withUrls = await Promise.all(items.map((doc) => this.withSignedUrl(doc)));
    return buildPaginated(withUrls, total, params.page, params.limit);
  }

  /** Aprova ou reprova um documento enviado pelo motorista. */
  async review(documentId: string, reviewerId: string, input: ReviewDocumentInput) {
    const document = await this.prisma.driverDocument.findUnique({ where: { id: documentId } });
    if (!document) throw BusinessException.notFound('Documento nao encontrado.');

    if (!document.uploadedAt) {
      throw BusinessException.validation('O motorista ainda nao enviou este documento.');
    }

    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        status: input.status === 'APPROVED' ? DocumentStatus.APPROVED : DocumentStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        rejectionReason: input.status === 'REJECTED' ? input.rejectionReason : null,
      },
    });

    const progress = await this.drivers.getDocumentProgress(document.driverId);
    this.logger.log(`Documento ${documentId} -> ${updated.status} por ${reviewerId}`);

    return { ...this.toPublic(updated), driverProgress: progress };
  }

  /** Remove um documento reprovado para permitir novo envio. */
  async removeMine(userId: string, documentId: string): Promise<void> {
    const document = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driver: { userId } },
    });

    if (!document) throw BusinessException.notFound('Documento nao encontrado.');
    if (document.status === DocumentStatus.APPROVED) {
      throw BusinessException.forbidden('Documentos aprovados nao podem ser removidos.');
    }

    await this.storage.delete(document.fileKey);
    await this.prisma.driverDocument.delete({ where: { id: document.id } });
  }

  /** Checklist de documentos exigidos (usado no app e no painel). */
  async requiredChecklist(userId: string) {
    const progress = await this.drivers.getDocumentProgress(
      (await this.prisma.driver.findUniqueOrThrow({ where: { userId }, select: { id: true } })).id,
    );

    return {
      required: REQUIRED_DRIVER_DOCUMENTS,
      progress,
    };
  }

  private async refreshDriverStatusAfterUpload(userId: string): Promise<void> {
    const driver = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (!driver) return;

    const progress = await this.drivers.getDocumentProgress(driver.id);
    if (progress.isComplete && driver.status === 'REJECTED') {
      await this.prisma.driver.update({ where: { id: driver.id }, data: { status: 'PENDING' } });
    }
  }

  private async withSignedUrl<T extends { fileKey: string }>(document: T) {
    return { ...document, fileUrl: await this.storage.createPresignedDownload(document.fileKey) };
  }

  private toPublic(document: {
    id: string;
    driverId: string;
    type: DocumentType;
    status: DocumentStatus;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date | null;
    reviewedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
  }) {
    return {
      id: document.id,
      driverId: document.driverId,
      type: document.type,
      status: document.status,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.uploadedAt,
      reviewedAt: document.reviewedAt,
      rejectionReason: document.rejectionReason,
      createdAt: document.createdAt,
    };
  }
}
