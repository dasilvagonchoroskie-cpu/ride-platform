import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/metadata.constants';

/** Marca uma rota como publica (ignora o JwtAuthGuard global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
