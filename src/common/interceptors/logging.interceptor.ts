import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const startedAt = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${req.method} ${req.url} completed in ${Date.now() - startedAt}ms`,
        );
      }),
    );
  }
}
