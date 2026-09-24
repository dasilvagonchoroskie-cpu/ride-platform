/**
 * Enums de dominio compartilhados.
 *
 * Declarados como objetos `const` + uniao de literais (e nao como `enum` do
 * TypeScript) por dois motivos:
 *  1. os enums gerados pelo Prisma tambem sao unioes de literais, entao os
 *     valores transitam entre a API e o banco sem cast;
 *  2. funcionam igualmente no backend e nos apps React Native.
 *
 * IMPORTANTE: devem permanecer em sincronia com os enums do Prisma
 * (apps/backend/prisma/schema.prisma).
 */

export const UserRole = {
  PASSENGER: 'PASSENGER',
  DRIVER: 'DRIVER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const OtpPurpose = {
  LOGIN: 'LOGIN',
  PHONE_VERIFICATION: 'PHONE_VERIFICATION',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

export const DevicePlatform = {
  IOS: 'IOS',
  ANDROID: 'ANDROID',
  WEB: 'WEB',
} as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const DriverStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];

export const DocumentType = {
  PROFILE_PHOTO: 'PROFILE_PHOTO',
  CNH_FRONT: 'CNH_FRONT',
  CNH_BACK: 'CNH_BACK',
  CRLV: 'CRLV',
  VEHICLE_FRONT: 'VEHICLE_FRONT',
  VEHICLE_BACK: 'VEHICLE_BACK',
  VEHICLE_PLATE: 'VEHICLE_PLATE',
  RESIDENCE_PROOF: 'RESIDENCE_PROOF',
  CRIMINAL_RECORD: 'CRIMINAL_RECORD',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** Documentos exigidos para o motorista ficar elegivel a aprovacao. */
export const REQUIRED_DRIVER_DOCUMENTS: DocumentType[] = [
  DocumentType.PROFILE_PHOTO,
  DocumentType.CNH_FRONT,
  DocumentType.CNH_BACK,
  DocumentType.CRLV,
  DocumentType.VEHICLE_FRONT,
  DocumentType.VEHICLE_BACK,
  DocumentType.VEHICLE_PLATE,
];

export const RideStatus = {
  REQUESTED: 'REQUESTED',
  SEARCHING: 'SEARCHING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_ARRIVING: 'DRIVER_ARRIVING',
  DRIVER_WAITING: 'DRIVER_WAITING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED_BY_PASSENGER: 'CANCELLED_BY_PASSENGER',
  CANCELLED_BY_DRIVER: 'CANCELLED_BY_DRIVER',
  CANCELLED_BY_SYSTEM: 'CANCELLED_BY_SYSTEM',
  EXPIRED: 'EXPIRED',
} as const;
export type RideStatus = (typeof RideStatus)[keyof typeof RideStatus];

/** Estados em que a corrida esta ativa (motorista ocupado). */
export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_WAITING,
  RideStatus.IN_PROGRESS,
];

export const OfferStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const PaymentMethodType = {
  CASH: 'CASH',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  PIX: 'PIX',
  WALLET: 'WALLET',
} as const;
export type PaymentMethodType = (typeof PaymentMethodType)[keyof typeof PaymentMethodType];

export const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const WalletTransactionType = {
  RIDE_EARNING: 'RIDE_EARNING',
  COMMISSION: 'COMMISSION',
  PAYOUT: 'PAYOUT',
  BONUS: 'BONUS',
  ADJUSTMENT: 'ADJUSTMENT',
  REFUND: 'REFUND',
} as const;
export type WalletTransactionType = (typeof WalletTransactionType)[keyof typeof WalletTransactionType];

export const PayoutStatus = {
  REQUESTED: 'REQUESTED',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const NotificationChannel = {
  PUSH: 'PUSH',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  READ: 'READ',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const SafetyEventType = {
  PANIC_BUTTON: 'PANIC_BUTTON',
  SHARE_RIDE: 'SHARE_RIDE',
  ROUTE_DEVIATION: 'ROUTE_DEVIATION',
  LONG_STOP: 'LONG_STOP',
  SOS_SUPPORT: 'SOS_SUPPORT',
} as const;
export type SafetyEventType = (typeof SafetyEventType)[keyof typeof SafetyEventType];
