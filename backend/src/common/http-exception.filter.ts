import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      message = body?.message ?? exception.message;
      code = body?.code ?? this.codeFromStatus(status);
      if (Array.isArray(body?.message)) {
        details = body.message;
        message = 'Validation failed';
        code = 'VALIDATION_ERROR';
      }
    } else {
      this.logger.error(exception);
    }

    res.status(status).json({ error: { code, message, details } });
  }

  private codeFromStatus(status: number): string {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHENTICATED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'BUSINESS_RULE',
        429: 'RATE_LIMITED',
      }[status] ?? 'ERROR'
    );
  }
}
