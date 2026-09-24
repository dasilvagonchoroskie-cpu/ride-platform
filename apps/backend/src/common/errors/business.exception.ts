import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from '@ride/shared';

export interface BusinessErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Excecao de negocio com `code` estavel consumido pelos apps.
 * Sempre use esta classe em vez de HttpException cru.
 */
export class BusinessException extends HttpException {
  constructor(
    code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    const body: BusinessErrorBody = { code, message, ...(details ? { details } : {}) };
    super(body, status);
  }

  static validation(message: string, details?: unknown): BusinessException {
    return new BusinessException(ERROR_CODES.VALIDATION_ERROR, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }

  static unauthorized(message = 'Nao autenticado.', code: ErrorCode = ERROR_CODES.UNAUTHORIZED): BusinessException {
    return new BusinessException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'Acesso negado.'): BusinessException {
    return new BusinessException(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static notFound(message = 'Recurso nao encontrado.'): BusinessException {
    return new BusinessException(ERROR_CODES.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT): BusinessException {
    return new BusinessException(code, message, HttpStatus.CONFLICT);
  }

  static tooManyRequests(message: string, code: ErrorCode = ERROR_CODES.RATE_LIMITED): BusinessException {
    return new BusinessException(code, message, HttpStatus.TOO_MANY_REQUESTS);
  }

  static internal(message = 'Erro interno inesperado.'): BusinessException {
    return new BusinessException(ERROR_CODES.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
