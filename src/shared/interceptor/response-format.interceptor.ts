// common/interceptors/response-format.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';


@Injectable()
export class ResponseFormatInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        // Edge case: don't wrap if the handler already sent the response
        // manually (e.g. res.sendFile, res.download, streams, SSE)
        const response = context.switchToHttp().getResponse();
        if (response?.headersSent) {
          return data;
        }

        // Edge case: skip wrapping for @Redirect() responses
        if (data?.url && data?.statusCode) {
          return data;
        }

        const request = context.switchToHttp().getRequest();

        return {
          success: true,
          message: 'Request successful',
          data: data === undefined ? null : data,
          timestamp: new Date().toISOString(),
          path: request?.url,
        };
      }),
    );
  }
}