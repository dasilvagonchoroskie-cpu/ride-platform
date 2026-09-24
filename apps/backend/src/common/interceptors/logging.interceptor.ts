import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl: string;
      user?: { id: string };
    }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsed = Date.now() - startedAt;
          const who = request.user?.id ? ` user=${request.user.id}` : '';
          this.logger.log(`${request.method} ${request.originalUrl} ${elapsed}ms${who}`);
        },
        error: (error: Error) => {
          const elapsed = Date.now() - startedAt;
          this.logger.warn(`${request.method} ${request.originalUrl} ${elapsed}ms ERRO: ${error.message}`);
        },
      }),
    );
  }
}
