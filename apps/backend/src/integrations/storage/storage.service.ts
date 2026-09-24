import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AppConfigService } from '../../config/app-config.service';
import { BusinessException } from '../../common/errors/business.exception';
import { ERROR_CODES } from '@ride/shared';

export interface PresignedUpload {
  documentKey: string;
  uploadUrl: string;
  expiresIn: number;
  publicUrl: string | null;
}

/**
 * Upload de documentos do motorista.
 * O app envia o arquivo DIRETO ao storage via URL assinada; o backend
 * so valida metadados e confirma o recebimento.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly enabled: boolean;

  constructor(private readonly config: AppConfigService) {
    const s3 = config.s3;
    this.enabled = Boolean(s3.accessKey && s3.secretKey);

    this.client = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      forcePathStyle: s3.forcePathStyle,
      credentials:
        s3.accessKey && s3.secretKey
          ? { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey }
          : undefined,
    });

    if (!this.enabled) {
      this.logger.warn('Storage S3 nao configurado: uploads retornarao erro 503.');
    }
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new BusinessException(
        ERROR_CODES.INTERNAL_ERROR,
        'Armazenamento de arquivos nao configurado. Defina S3_ACCESS_KEY e S3_SECRET_KEY.',
        503,
      );
    }
  }

  /** Monta a chave do objeto: drivers/{driverId}/{tipo}/{uuid}.{ext} */
  buildDocumentKey(driverId: string, type: string, fileName: string): string {
    const extension = extname(fileName).toLowerCase() || '.bin';
    return `drivers/${driverId}/${type.toLowerCase()}/${randomUUID()}${extension}`;
  }

  /** Gera URL assinada de PUT (upload) e a URL publica/assinada de leitura. */
  async createPresignedUpload(params: {
    key: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<PresignedUpload> {
    this.ensureEnabled();
    const bucket = this.config.s3.bucketDocuments;

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        ContentType: params.mimeType,
        ContentLength: params.sizeBytes,
      }),
      { expiresIn: this.config.s3.signedUrlTtl },
    );

    return {
      documentKey: params.key,
      uploadUrl,
      expiresIn: this.config.s3.signedUrlTtl,
      publicUrl: await this.createPresignedDownload(params.key),
    };
  }

  /** URL assinada de leitura (usada pelo painel admin para ver o documento). */
  async createPresignedDownload(key: string): Promise<string | null> {
    if (!this.enabled) return null;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.s3.bucketDocuments, Key: key }),
      { expiresIn: this.config.s3.signedUrlTtl },
    );
  }

  async exists(key: string): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.s3.bucketDocuments, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.s3.bucketDocuments, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Falha ao remover ${key}: ${(error as Error).message}`);
    }
  }
}
