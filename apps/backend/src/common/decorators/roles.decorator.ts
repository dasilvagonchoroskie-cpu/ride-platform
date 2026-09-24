import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@ride/shared';
import { ROLES_KEY } from '../constants/metadata.constants';

/** Restringe a rota aos papeis informados. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
