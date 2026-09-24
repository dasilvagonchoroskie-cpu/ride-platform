import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { BusinessException } from '../errors/business.exception';

interface FormattedIssue {
  path: string;
  message: string;
  code: string;
}

/** Valida body/query/params com um schema Zod compartilhado com os apps. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues: FormattedIssue[] = error.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message,
          code: issue.code,
        }));
        throw BusinessException.validation('Dados invalidos na requisicao.', issues);
      }
      throw error;
    }
  }
}
