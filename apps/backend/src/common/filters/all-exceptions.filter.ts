import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, ErrorCode } from '@ride/shared';
import { Request, Response } from 'express';

interface ErrorPayload {
  success: false;
  error: { code: ErrorCode | string; message: string; details?: unknown };
  timestamp: string;
  path: string;
}

/** Converte qualquer excecao em uma resposta JSON previsivel. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const payload: ErrorPayload = {
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(payload);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null && 'code' in body) {
        const typed = body as { code: string; message: string; details?: unknown };
        return { status, code: typed.code, message: typed.message, details: typed.details };
      }

      if (typeof body === 'object' && body !== null && 'message' in body) {
        const typed = body as { message: string | string[] };
        const message = Array.isArray(typed.message) ? typed.message.join('; ') : typed.message;
        return { status, code: this.codeFromStatus(status), message };
      }

      return { status, code: this.codeFromStatus(status), message: String(body) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Dados invalidos para o banco de dados.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro interno inesperado.',
    };
  }

  private fromPrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | string | undefined) ?? 'campo unico';
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: `Registro duplicado: ${Array.isArray(target) ? target.join(', ') : target}.`,
          details: error.meta,
        };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: ERROR_CODES.NOT_FOUND, message: 'Registro nao encontrado.' };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: 'Violacao de chave estrangeira.',
          details: error.meta,
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `Erro de banco de dados (${error.code}).`,
        };
    }
  }

  private codeFromStatus(status: number): string {
    const map: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_ERROR,
      [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
      [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
      [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
      [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.VALIDATION_ERROR,
    };
    return map[status] ?? ERROR_CODES.INTERNAL_ERROR;
  }
}
