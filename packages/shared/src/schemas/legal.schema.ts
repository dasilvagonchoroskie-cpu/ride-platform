import { z } from 'zod';

/**
 * Aceite dos Termos de Uso.
 *
 * A versao vai junto: se o texto mudar depois, o aplicativo sabe pedir o
 * aceite de novo em vez de assumir que um "sim" antigo ainda vale para um
 * documento diferente.
 */
export const acceptTermsSchema = z.object({
  version: z.string().min(1).max(20),
});

export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>;
