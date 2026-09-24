/**
 * DTOs do modulo de usuarios: os contratos sao definidos em @ride/shared
 * (Zod) e reutilizados pelos apps mobile e pelo painel admin.
 */
export {
  updateProfileSchema,
  createAddressSchema,
  updateAddressSchema,
  blockUserSchema,
  adminListUsersSchema,
  type UpdateProfileInput,
  type CreateAddressInput,
  type UpdateAddressInput,
  type BlockUserInput,
} from '@ride/shared';
