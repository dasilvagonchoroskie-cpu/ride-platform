import { z } from 'zod';
import { DocumentType } from '../enums';
import { uuidSchema } from './common.schema';

const documentTypeEnum = z.nativeEnum(DocumentType);

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Etapa 1: o app pede uma URL assinada para enviar o arquivo direto ao storage. */
export const requestDocumentUploadSchema = z.object({
  type: documentTypeEnum,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_DOCUMENT_SIZE_BYTES, 'Arquivo maior que 10 MB.'),
});

/** Etapa 2: o app confirma que o upload terminou. */
export const confirmDocumentUploadSchema = z.object({
  documentId: uuidSchema,
  checksum: z.string().trim().max(128).optional(),
});

export const reviewDocumentSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((data) => data.status !== 'REJECTED' || Boolean(data.rejectionReason), {
    message: 'Motivo da reprovacao e obrigatorio.',
    path: ['rejectionReason'],
  });

export const documentIdParamSchema = z.object({ id: uuidSchema });

export const listDocumentsSchema = z.object({
  driverId: uuidSchema.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  type: documentTypeEnum.optional(),
});

export type RequestDocumentUploadInput = z.infer<typeof requestDocumentUploadSchema>;
export type ConfirmDocumentUploadInput = z.infer<typeof confirmDocumentUploadSchema>;
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
