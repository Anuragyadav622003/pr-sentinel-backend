// common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response.interface';
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Edge case: headers already sent (e.g. mid-stream failure) —
    // can't send a JSON body, just close out and log.
    if (response.headersSent) {
      this.logger.error(
        `Exception after headers sent: ${this.getMessage(exception)}`,
      );
      return;
    }

    const status = this.getStatus(exception);
    const { message, extra } = this.parseException(exception);

    // Log 5xx as errors (with stack), 4xx as warnings (no noise)
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${message}`);
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      error: {
        statusCode: status,
        ...extra,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getMessage(exception: unknown): string {
    if (exception instanceof Error) return exception.message;
    return 'Unknown error';
  }

  private parseException(exception: unknown): {
    message: string;
    extra: Record<string, unknown>;
  } {
    // Case 1: Nest HttpException (includes ValidationPipe's BadRequestException)
    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      // res can be a string...
      if (typeof res === 'string') {
        return { message: res, extra: {} };
      }

      // ...or an object like { statusCode, message, error }
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;

        // Edge case: class-validator errors — message is a string[]
        if (Array.isArray(obj.message)) {
          return {
            message: 'Validation failed',
            extra: { errors: obj.message },
          };
        }

        return {
          message: (obj.message as string) ?? exception.message,
          extra: obj.error ? { error: obj.error } : {},
        };
      }

      return { message: exception.message, extra: {} };
    }

    // Case 2: standard JS Error (thrown from a service, DB driver, etc.)
    if (exception instanceof Error) {
      return {
        message:
          process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : exception.message,
        extra: {},
      };
    }

    // Case 3: something threw a string, number, or other non-Error value
    return {
      message: 'Internal server error',
      extra: {},
    };
  }
}